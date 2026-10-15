// Purging a whole organization (spec 5): a super admin asks, with the organization's code typed and an export from
// the last day, once it is cancelled; the console's job then deletes everything, and the platform log keeps the record.
import { randomUUID } from "node:crypto";
import type { QueuedJob, RequestPurgeInput } from "@travel-crm/contracts/platform";
import { deleteOrganizationRows, type PlatformTx } from "@travel-crm/db/platform";
import { deleteStoredFiles, storedFileKeys } from "../files/index.js";
import { deleteUsers, findOrganizationRecord, organizationUserIds } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { getSubscription } from "../subscriptions/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import { exportedRecently } from "./exports.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export const PURGE_ORGANIZATION_QUEUE = "platform.purge-organization";

/** Big organizations take a while; the purge is one transaction, so nothing is left half done. */
const PURGE_TIMEOUT_MS = 10 * 60 * 1000;

export async function requestPurge(
  services: PlatformServices,
  staff: { userId: string },
  input: RequestPurgeInput,
  now: Date = new Date(),
): Promise<QueuedJob> {
  return services.platformDb.transaction(async (tx) => {
    const organization = await findOrganizationRecord(tx, input.organizationId);
    if (input.confirmation !== organization.code) {
      throw new DomainError("VALIDATION", "CONFIRMATION_MISMATCH", "Type the organization's code to confirm");
    }
    if ((await getSubscription(tx, input.organizationId)).status !== "cancelled") {
      throw new DomainError("CONFLICT", "CANCEL_FIRST", "Cancel the organization's subscription before purging it");
    }
    if (!(await exportedRecently(tx, "organization.exported", input.organizationId, now))) {
      throw new DomainError("CONFLICT", "EXPORT_FIRST", "Export the organization's data first (within the last day)");
    }
    await recordPlatformAudit(tx, staff, {
      action: "organization.purge-requested",
      targetType: "organization",
      targetId: input.organizationId,
      targetOrganizationId: input.organizationId,
    });
    const jobId = randomUUID();
    await services.queue.send(
      PURGE_ORGANIZATION_QUEUE,
      { organizationId: input.organizationId, requestedBy: staff.userId },
      { id: jobId },
    );
    return { jobId };
  });
}

/** What a purge removed, in the platform log. */
export interface PurgeResult {
  rows: number;
  people: number;
  files: number;
}

/**
 * The job: deletes the organization's rows (every table, found from the catalog), its people, and its stored files,
 * and blanks its webhook events, then records "organization.purged". An organization already gone is a no-op, so the
 * job is safe to run again; stored files are deleted after the transaction commits. It purges only an organization
 * still cancelled: one a payment made active again since the request is kept, and "organization.purge-skipped" says
 * why. The nightly demo reset, which purges an active demo, says `requireCancelled: false`.
 */
export async function purgeOrganization(
  services: PlatformServices,
  job: { organizationId: string; requestedBy: string | null },
  options: { requireCancelled?: boolean } = {},
): Promise<PurgeResult | null> {
  const purged = await services.platformDb.transaction(
    async (tx) => {
      const code = await codeOf(tx, job.organizationId);
      if (code === null) return null;
      const status = await statusOf(tx, job.organizationId);
      if ((options.requireCancelled ?? true) && status !== "cancelled") {
        await recordPlatformAudit(
          tx,
          { userId: job.requestedBy },
          {
            action: "organization.purge-skipped",
            targetType: "organization",
            targetId: job.organizationId,
            targetOrganizationId: job.organizationId,
            after: { status },
          },
        );
        return null;
      }
      const keys = await storedFileKeys(tx, job.organizationId);
      const userIds = await organizationUserIds(tx, job.organizationId);
      const webhooks = await tombstoneWebhookEvents(tx, job.organizationId);
      const deleted = await deleteOrganizationRows(tx, job.organizationId);
      const people = await deleteUsers(tx, userIds);
      const result: PurgeResult = {
        rows: Object.values(deleted).reduce((total, count) => total + count, 0),
        people,
        files: keys.length,
      };
      const actor: PlatformActor = { userId: job.requestedBy };
      await recordPlatformAudit(tx, actor, {
        action: "organization.purged",
        targetType: "organization",
        targetId: job.organizationId,
        targetOrganizationId: job.organizationId,
        before: { code },
        after: { ...result, webhooksTombstoned: webhooks.tombstoned, webhooksWaiting: webhooks.waiting },
      });
      return { result, keys };
    },
    { timeout: PURGE_TIMEOUT_MS },
  );
  if (!purged) return null;
  await deleteStoredFiles(services.storage, purged.keys);
  return purged.result;
}

/** The subscription's status as stored, or null without one. */
async function statusOf(tx: PlatformTx, organizationId: string): Promise<string | null> {
  const subscription = await tx.subscription.findUnique({ where: { organizationId }, select: { status: true } });
  return subscription?.status ?? null;
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
