// Stand-ins, with the exact signatures, for functions other fix-wave branches add or change (plan 4's fix wave), so
// this branch builds and its tests run. The controller deletes this file at merge and imports the real ones:
// - lockSubscription from the subscriptions module's index (wave S), which takes FOR NO KEY UPDATE;
// - expireOrganizationExports from the platform module (wave P), which expires the organization's stored exports;
// - exportedRecently from exports.ts (wave P), whose organizationId is required there;
// - the console process's log on PlatformServices, if wave P adds one (otherwise the console's own line format).
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import type { PlatformTx } from "@travel-crm/db/platform";
import { getSubscription } from "../subscriptions/index.js";
import { EXPORT_VALID_FOR_MS } from "./exports.js";
import type { PlatformServices } from "./services.js";

/**
 * Holds the subscription until the transaction ends, so a payment or another change can't interleave, and returns it
 * as it is once held. SUBSCRIPTION_NOT_FOUND without one.
 */
export async function lockSubscription(tx: OrgTx, organizationId: string): Promise<SubscriptionDetails> {
  await tx.$queryRaw`SELECT organization_id FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  return getSubscription(tx, organizationId);
}

/**
 * Marks every stored export of the organization expired and logs it, in the transaction, and queues the sweep that
 * deletes their files, and returns how many it withdrew: an erased person must not stay in an export kept for its 7
 * days. This branch stores no exports yet (wave P's export job does), so there are none to expire here.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- the stand-in keeps wave P's signature, which uses all four */
export function expireOrganizationExports(
  services: PlatformServices,
  tx: PlatformTx,
  organizationId: string,
  reason: "erasure",
): Promise<number> {
  return Promise.resolve(0);
}
/* eslint-enable @typescript-eslint/no-unused-vars */

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
