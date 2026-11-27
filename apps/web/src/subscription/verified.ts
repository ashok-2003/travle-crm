// Whether the agency shows the verified tick (paid-plans spec, part B): its subscription is active and paid through
// today or later, and it is not the shared demo. A trial, past due, read-only or suspended agency, or one paid
// through yesterday, shows none.
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import type { CalendarDate } from "@travel-crm/domain/kernel";

/** The key of the demo's own plan (domain's DEMO_PLAN_KEY), which the web app can't import. */
export const DEMO_PLAN_KEY = "platform-demo";

/** `today` is the organization's day, as a calendar date. */
export function isVerified(overview: SubscriptionOverview, today: CalendarDate): boolean {
  return (
    overview.status === "active" &&
    overview.planKey !== DEMO_PLAN_KEY &&
    overview.paidThrough !== null &&
    overview.paidThrough >= today
  );
}
