// The lifecycle's policy (spec 7.3; Q3; the owner's pricing): how many days a new organization's trial lasts, and how
// many an organization stays past due, then read-only, before the next state (7, 7 and 14). One row, changed by super
// admins from the console.
import type { SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";

export async function getSubscriptionPolicy(tx: OrgTx): Promise<SubscriptionPolicy> {
  const policy = await tx.subscriptionPolicy.findUniqueOrThrow({ where: { id: true } });
  return { trialDays: policy.trialDays, pastDueDays: policy.pastDueDays, readOnlyDays: policy.readOnlyDays };
}

/** Whether two policies give the same days, field by field (not by how their keys happen to be ordered). */
export function samePolicy(a: SubscriptionPolicy, b: SubscriptionPolicy): boolean {
  return a.trialDays === b.trialDays && a.pastDueDays === b.pastDueDays && a.readOnlyDays === b.readOnlyDays;
}

/**
 * Changes the days. Organizations already in a state count its days from when they entered it, with the new rule; a
 * trial already started keeps its last day. `changed` is false when the days were already these.
 */
export async function setSubscriptionPolicy(
  tx: OrgTx,
  by: { userId: string },
  policy: SubscriptionPolicy,
): Promise<{ before: SubscriptionPolicy; after: SubscriptionPolicy; changed: boolean }> {
  const before = await getSubscriptionPolicy(tx);
  const after = { trialDays: policy.trialDays, pastDueDays: policy.pastDueDays, readOnlyDays: policy.readOnlyDays };
  if (samePolicy(before, after)) return { before, after: before, changed: false };
  await tx.subscriptionPolicy.update({ where: { id: true }, data: { ...after, updatedBy: by.userId } });
  return { before, after, changed: true };
}
