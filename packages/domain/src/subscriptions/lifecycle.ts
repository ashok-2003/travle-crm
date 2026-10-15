// The subscription lifecycle (spec 7.3): trial or active, then past due, read-only and suspended as unpaid days pass,
// each for the policy's number of days. Suspended and cancelled stay put until a person acts: a payment or time given
// ends either, and only a person cancels. Pure rules on calendar days in the organization's time zone, used by the
// request checks, the console's changes and the nightly job alike.
import type { SubscriptionPolicy, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { addDays, type CalendarDate } from "../kernel/index.js";

/** The policy's days the unpaid states last; the trial's own days matter only when a subscription starts. */
export type UnpaidDays = Pick<SubscriptionPolicy, "pastDueDays" | "readOnlyDays">;

/** What the lifecycle reads of a subscription. */
export interface LifecycleState {
  status: SubscriptionStatus;
  /** The first day of the current status. */
  since: CalendarDate;
  trialEndsOn: CalendarDate | null;
  paidThrough: CalendarDate | null;
}

/** The state a subscription moves to if nothing is paid, and its first day; null when only a person moves it on. */
export function nextStep(
  state: LifecycleState,
  policy: UnpaidDays,
): { status: SubscriptionStatus; on: CalendarDate } | null {
  switch (state.status) {
    case "trial":
      return state.trialEndsOn ? { status: "past_due", on: addDays(state.trialEndsOn, 1) } : null;
    case "active":
      return state.paidThrough ? { status: "past_due", on: addDays(state.paidThrough, 1) } : null;
    case "past_due":
      return { status: "read_only", on: addDays(state.since, policy.pastDueDays) };
    case "read_only":
      return { status: "suspended", on: addDays(state.since, policy.readOnlyDays) };
    case "suspended":
    case "cancelled":
      return null;
  }
}

/**
 * Where the lifecycle has got to by today: every step whose first day has come, in order, each counted from the day
 * the one before it began. So the state is right however long ago the daily job last ran.
 */
export function dueState(state: LifecycleState, policy: UnpaidDays, today: CalendarDate): LifecycleState {
  let current = state;
  for (let next = nextStep(current, policy); next !== null && next.on <= today; next = nextStep(current, policy)) {
    current = { ...current, status: next.status, since: next.on };
  }
  return current;
}
