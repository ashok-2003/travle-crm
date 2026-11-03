// Moves a journey's agency along the subscription lifecycle (spec 7.3), straight in the database as the console's
// nightly job records it: the state begins today and the payment ran out before it. The journeys' api keeps no access
// cache (ACCESS_CACHE=false in servers.ts), so it works out the state due today on every request: the agency is in it
// at once. A page already open keeps the plan it read for ten minutes, even across a reload: forgetSavedCopy.
import type { Page } from "@playwright/test";
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

/**
 * Voids the copy of the query cache the open page saved (src/data/persistence.ts), as a wipe does, so the next page load
 * asks the api again instead of showing the plan it read before the database changed under it.
 */
export async function forgetSavedCopy(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.setItem("travel-crm.saved-copy-generation", crypto.randomUUID());
  });
}
