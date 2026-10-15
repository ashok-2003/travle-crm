// What the shell's banner says about the subscription today (spec 7.3: past due is full access plus a warning): the
// trial's last week, payment due with the day read-only begins, and read-only itself. Suspended and cancelled shut
// the screens instead (locks.ts), so they have no banner.
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { addDays, parseCalendarDate, type CalendarDate } from "@travel-crm/domain/kernel";

/** How many days before its end, its last day included, a trial says when it ends. */
export const TRIAL_ENDING_DAYS = 7;

export type SubscriptionNotice =
  { kind: "trialEnding"; on: string } | { kind: "pastDue"; readOnlyFrom: string | null } | { kind: "readOnly" };

/** The banner for the subscription on `today`, the organization's day, or null for none. */
export function noticeOf(overview: SubscriptionOverview, today: CalendarDate): SubscriptionNotice | null {
  switch (overview.status) {
    case "trial": {
      const endsOn = overview.trialEndsOn;
      const ending = endsOn !== null && addDays(parseCalendarDate(endsOn), 1 - TRIAL_ENDING_DAYS) <= today;
      return ending ? { kind: "trialEnding", on: endsOn } : null;
    }
    case "past_due":
      return { kind: "pastDue", readOnlyFrom: overview.nextChangeOn };
    case "read_only":
      return { kind: "readOnly" };
    case "active":
    case "suspended":
    case "cancelled":
      return null;
  }
}
