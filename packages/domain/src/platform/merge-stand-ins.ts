// Stand-ins, with the exact signatures, for two functions other fix-wave branches add (plan 4's fix wave), so this
// branch builds and its tests run. The controller deletes this file at merge and imports the real ones:
// - lockSubscription from the subscriptions module's index (wave S), which takes FOR NO KEY UPDATE;
// - expireOrganizationExports from the platform module (wave P), which deletes the organization's stored exports.
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import type { PlatformTx } from "@travel-crm/db/platform";
import { getSubscription } from "../subscriptions/index.js";

/**
 * Holds the subscription until the transaction ends, so a payment or another change can't interleave, and returns it
 * as it is once held. SUBSCRIPTION_NOT_FOUND without one.
 */
export async function lockSubscription(tx: OrgTx, organizationId: string): Promise<SubscriptionDetails> {
  await tx.$queryRaw`SELECT organization_id FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  return getSubscription(tx, organizationId);
}

/**
 * Deletes every stored export of the organization, its files and parts, and logs it: an erased person must not stay
 * in an export kept for its 7 days. This branch stores no exports yet (wave P's export job does), so nothing is left
 * to expire here.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the stand-in's signature is wave P's, which uses all three
export function expireOrganizationExports(tx: PlatformTx, organizationId: string, reason: "erasure"): Promise<void> {
  return Promise.resolve();
}
