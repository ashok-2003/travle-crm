// Moves a journey's agency along the subscription lifecycle (spec 7.3), straight in the database as the console's
// nightly job records it: the state begins today and the payment ran out before it. The api works out the state due
// today from these on every request, so the agency is in it at once.
import type { PlatformClient } from "@travel-crm/db/platform";

/** The lifecycle's states after a payment runs out (and cancelled, which a person decides). */
export type UnpaidState = "past_due" | "read_only" | "suspended" | "cancelled";

const DAY = 24 * 60 * 60 * 1000;

export async function setSubscriptionState(
  platform: PlatformClient,
  organizationId: string,
  status: UnpaidState,
): Promise<void> {
  await platform.subscription.update({
    where: { organizationId },
    data: { status, statusChangedAt: new Date(), paidThrough: new Date(Date.now() - 30 * DAY) },
  });
}
