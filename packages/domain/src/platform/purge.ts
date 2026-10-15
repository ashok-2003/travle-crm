// Purging a whole organization (spec 5): a super admin asks, with the organization's code typed and an export from
// the last day, once it is cancelled; the console's job checks all of it again, deletes everything, and the platform
// log keeps the record. Stored files go once the job commits, through the deletions' outbox (file-deletions.ts).
import { randomUUID } from "node:crypto";
import type { QueuedJob, RequestPurgeInput } from "@travel-crm/contracts/platform";
import { deleteOrganizationRows, type PlatformTx } from "@travel-crm/db/platform";
import { queueOrganizationFileDeletion } from "../files/index.js";
import { deleteUsers, findOrganizationRecord, organizationUserIds } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { entitlementsOf } from "../subscriptions/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import { deleteFilesAfterCommit } from "./file-deletions.js";
import { hasFreshExport, lockSubscription } from "./merge-stand-ins.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export const PURGE_ORGANIZATION_QUEUE = "platform.purge-organization";

/** Big organizations take a while; the purge is one transaction, so nothing is left half done. */
const PURGE_TIMEOUT_MS = 10 * 60 * 1000;

/** Why an organization can't be purged now: the request refuses with it, and the job skips and logs it. */
export type PurgeBlocker = "not-cancelled" | "no-recent-export";

function refusal(blocker: PurgeBlocker): DomainError {
  return blocker === "not-cancelled"
    ? new DomainError("CONFLICT", "CANCEL_FIRST", "Cancel the organization's subscription before purging it")
    : new DomainError("CONFLICT", "EXPORT_FIRST", "Export the organization's data first (within the last day)");
}

/**
 * What stands in the purge's way: the organization must be cancelled by its lifecycle as of today, and have an export
 * done within the last day and not withdrawn since (an erasure withdraws every export, as it may hold the erased
 * person, though its log entry stays). Checked under the subscription's lock (the one every subscription change takes), so a payment recorded
 * now waits for the purge, then finds the organization gone, rather than vanishing with it.
 *
 * Run on the platform transaction itself, never inside an asOrganization step: a step sees only its organization, so a
 * check made there could find too little and let a purge through.
 */
export async function purgeBlocker(
  tx: PlatformTx,
  organizationId: string,
  now: Date,
): Promise<{ blocker: PurgeBlocker | null; status: string | null }> {
  try {
    await lockSubscription(tx, organizationId);
  } catch (error) {
    if (!(error instanceof DomainError && error.reason === "SUBSCRIPTION_NOT_FOUND")) throw error;
    return { blocker: "not-cancelled", status: null };
  }
  const status = (await entitlementsOf(tx, organizationId, now))?.status ?? null;
  if (status !== "cancelled") return { blocker: "not-cancelled", status };
  if (!(await hasFreshExport(tx, organizationId, now))) {
    return { blocker: "no-recent-export", status };
  }
  return { blocker: null, status };
}

export async function requestPurge(
  services: PlatformServices,
  staff: { userId: string },
  input: RequestPurgeInput,
  now: Date = new Date(),
): Promise<QueuedJob> {
  await services.platformDb.transaction(async (tx) => {
    const organization = await findOrganizationRecord(tx, input.organizationId);
    if (input.confirmation !== organization.code) {
      throw new DomainError("VALIDATION", "CONFIRMATION_MISMATCH", "Type the organization's code to confirm");
    }
    const { blocker } = await purgeBlocker(tx, input.organizationId, now);
    if (blocker !== null) throw refusal(blocker);
    await recordPlatformAudit(tx, staff, {
      action: "organization.purge-requested",
      targetType: "organization",
      targetId: input.organizationId,
      targetOrganizationId: input.organizationId,
    });
  });
  // Queued once the request is recorded, so no job runs without one; the job checks everything again when it runs.
  const jobId = randomUUID();
  await services.queue.send(
    PURGE_ORGANIZATION_QUEUE,
    { organizationId: input.organizationId, requestedBy: staff.userId },
    { id: jobId },
  );
  return { jobId };
}

/** What a purge removed, in the platform log. */
export interface PurgeResult {
  rows: number;
  people: number;
  files: number;
}

/**
 * The job: deletes the organization's rows (every table, found from the catalog), its people, and its stored files,
 * and blanks its webhook events, then records "organization.purged" under the super admin who asked. It checks the
 * request's conditions again first: an organization a payment made active again, or whose last export is over a day
 * old by now, is kept, and "organization.purge-skipped" says why. The nightly demo reset, which purges an active demo
 * that nobody exports, says `requireCancelled: false`, and none of an agency's checks apply.
 *
 * Safe to run again: an organization already gone has its storage folder swept again, for anything that reached it
 * since. Stored files go once the transaction commits, through the deletions' outbox, so a storage error or a restart
 * after the commit leaves them queued for the console's job, never stored for good.
 */
export async function purgeOrganization(
  services: PlatformServices,
  job: { organizationId: string; requestedBy: string | null },
  options: { requireCancelled?: boolean; now?: Date } = {},
): Promise<PurgeResult | null> {
  const now = options.now ?? new Date();
  const actor = { userId: job.requestedBy };
  const target = { targetType: "organization", targetId: job.organizationId, targetOrganizationId: job.organizationId };
  const outcome = await services.platformDb.transaction(
    async (tx): Promise<PurgeResult | "gone" | "skipped"> => {
      const code = await codeOf(tx, job.organizationId);
      if (code === null) {
        await queueOrganizationFileDeletion(tx, job.organizationId, now);
        return "gone";
      }
      const { blocker, status } = await purgeBlocker(tx, job.organizationId, now);
      if ((options.requireCancelled ?? true) && blocker !== null) {
        await recordPlatformAudit(tx, actor, {
          action: "organization.purge-skipped",
          ...target,
          after: { reason: blocker, status },
        });
        return "skipped";
      }
      const files = await queueOrganizationFileDeletion(tx, job.organizationId, now);
      const userIds = await organizationUserIds(tx, job.organizationId);
      const webhooks = await tombstoneWebhookEvents(tx, job.organizationId, { organizationGone: true });
      const deleted = await deleteOrganizationRows(tx, job.organizationId);
      const people = await deleteUsers(tx, userIds);
      const result: PurgeResult = {
        rows: Object.values(deleted).reduce((total, count) => total + count, 0),
        people,
        files,
      };
      await recordPlatformAudit(tx, actor, {
        action: "organization.purged",
        ...target,
        before: { code },
        after: { ...result, webhooksTombstoned: webhooks.tombstoned, webhooksWaiting: webhooks.waiting },
      });
      return result;
    },
    { timeout: PURGE_TIMEOUT_MS },
  );
  if (outcome === "skipped") return null;
  await deleteFilesAfterCommit(services, job.organizationId, now);
  return outcome === "gone" ? null : outcome;
}

/** The organization's code, or null once it is gone. */
async function codeOf(tx: PlatformTx, organizationId: string): Promise<string | null> {
  try {
    return (await findOrganizationRecord(tx, organizationId)).code;
  } catch (error) {
    if (error instanceof DomainError && error.reason === "ORGANIZATION_NOT_FOUND") return null;
    throw error;
  }
}
