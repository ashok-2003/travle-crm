// Stand-ins, with the exact signatures, for functions other fix-wave branches add or change (plan 4's fix wave), so
// this branch builds and its tests run. The controller deletes this file at merge and imports the real ones:
// - lockSubscription from the subscriptions module's index (wave S), which takes FOR NO KEY UPDATE;
// - expireOrganizationExports from the platform module (wave P), which expires the organization's stored exports;
// - hasFreshExport from the platform module (wave P): a done export, not withdrawn, from the last day;
// - exportedRecently from exports.ts (wave P), whose organizationId is required there;
// - the console process's log on PlatformServices, if wave P adds one (otherwise the console's own line format).
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import type { PlatformTx } from "@travel-crm/db/platform";
import { getSubscription } from "../subscriptions/index.js";
import { EXPORT_VALID_FOR_MS } from "./exports.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/**
 * Holds the subscription until the transaction ends, so a payment or another change can't interleave, and returns it
 * as it is once held. SUBSCRIPTION_NOT_FOUND without one.
 */
export async function lockSubscription(tx: OrgTx, organizationId: string): Promise<SubscriptionDetails> {
  await tx.$queryRaw`SELECT organization_id FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  return getSubscription(tx, organizationId);
}

/** How long wave P keeps a stored export before it expires. */
const EXPORT_KEPT_FOR_MS = 7 * 24 * 60 * 60 * 1000;

/** What withdrawing an organization's exports leaves in the platform log here; wave P's export rows say it there. */
const EXPORTS_WITHDRAWN = "organization.exports-withdrawn";

/**
 * Marks every stored export of the organization expired and logs it, in the transaction, and queues the sweep that
 * deletes their files, and returns how many it withdrew: an erased person must not stay in an export kept for its 7
 * days. This branch stores no exports yet (wave P's export job does), so its exports are its `organization.exported`
 * entries of the last 7 days since the last withdrawal, and withdrawing them is a platform log entry.
 */
export async function expireOrganizationExports(
  services: PlatformServices,
  tx: PlatformTx,
  organizationId: string,
  reason: "erasure",
): Promise<number> {
  const since = new Date(Date.now() - EXPORT_KEPT_FOR_MS);
  const exports = await exportsSinceWithdrawal(tx, organizationId, since);
  if (exports.length === 0) return 0;
  await recordPlatformAudit(
    tx,
    { userId: null },
    {
      action: EXPORTS_WITHDRAWN,
      targetType: "organization",
      targetId: organizationId,
      targetOrganizationId: organizationId,
      after: { reason, exports: exports.length },
    },
  );
  return exports.length;
}

/**
 * Whether the organization has an export, done and not withdrawn, completed within the last day before `now`: what a
 * purge needs. An erasure since the export withdrew it, so it no longer counts, though its log entry stays.
 */
export async function hasFreshExport(tx: PlatformTx, organizationId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - EXPORT_VALID_FOR_MS);
  return (await exportsSinceWithdrawal(tx, organizationId, since)).length > 0;
}

/** The organization's `organization.exported` entries since `since` and after its last withdrawal, if any. */
async function exportsSinceWithdrawal(tx: PlatformTx, organizationId: string, since: Date): Promise<{ id: string }[]> {
  const scoped = { targetOrganizationId: organizationId };
  // Entries of one transaction share its time; the id (UUID v7) orders them.
  const withdrawn = await tx.platformAuditEntry.findFirst({
    where: { ...scoped, action: EXPORTS_WITHDRAWN },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: { id: true, occurredAt: true },
  });
  const after = withdrawn
    ? {
        OR: [
          { occurredAt: { gt: withdrawn.occurredAt } },
          { occurredAt: withdrawn.occurredAt, id: { gt: withdrawn.id } },
        ],
      }
    : {};
  return tx.platformAuditEntry.findMany({
    where: { ...scoped, action: "organization.exported", occurredAt: { gte: since }, ...after },
    select: { id: true },
  });
}

/**
 * Where the console process's problems go, one ids-only line each: the services' log when they carry one, else the
 * same `console: <line>` on stderr that the console process's own log writes (apps/api's processLog).
 */
export function platformLog(services: PlatformServices): (line: string) => void {
  const log = (services as { log?: (line: string) => void }).log;
  if (log) return log;
  return (line) => {
    console.error(`console: ${line}`);
  };
}

/**
 * Whether `action` was logged for the target, in the organization, within the last day before `now`: matched on the
 * organization too, so one organization's export never counts for another's.
 */
export async function exportedRecently(
  tx: PlatformTx,
  action: string,
  targetId: string,
  now: Date,
  organizationId: string,
): Promise<boolean> {
  const since = new Date(now.getTime() - EXPORT_VALID_FOR_MS);
  const where = { action, targetId, targetOrganizationId: organizationId, occurredAt: { gte: since } };
  return (await tx.platformAuditEntry.count({ where })) > 0;
}
