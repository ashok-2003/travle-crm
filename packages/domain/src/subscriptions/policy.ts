// How many days an organization stays past due, then read-only, before the next state (spec 7.3; Q3: 7 and 14). One
// row, changed by super admins from the console.
import type { SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";

export async function getSubscriptionPolicy(tx: OrgTx): Promise<SubscriptionPolicy> {
  const policy = await tx.subscriptionPolicy.findUniqueOrThrow({ where: { id: true } });
  return { pastDueDays: policy.pastDueDays, readOnlyDays: policy.readOnlyDays };
}

/** Changes the days. Organizations already in a state count its days from when they entered it, with the new rule. */
export async function setSubscriptionPolicy(
  tx: OrgTx,
  by: { userId: string },
  policy: SubscriptionPolicy,
): Promise<{ before: SubscriptionPolicy; after: SubscriptionPolicy }> {
  const before = await getSubscriptionPolicy(tx);
  await tx.subscriptionPolicy.update({ where: { id: true }, data: { ...policy, updatedBy: by.userId } });
  return { before, after: policy };
}
