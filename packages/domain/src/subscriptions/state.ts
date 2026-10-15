// A subscription's state today (spec 7.3): the lifecycle followed from what was last recorded up to today in the
// organization's time zone, with a suspension made by hand on top. Every rule and screen uses it, never the stored
// status, so whether the nightly job has run changes no answer. And the lock every change takes first.
import type { SubscriptionPolicy, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn, DomainError, startOfDayIn, type CalendarDate } from "../kernel/index.js";
import { fromDateColumn } from "./dates.js";
import { dueState, nextStep, type LifecycleState } from "./lifecycle.js";
import { getSubscriptionPolicy } from "./policy.js";
import { statusOf, withPlan, type StoredSubscription } from "./rows.js";

export interface SubscriptionToday {
  timeZone: string;
  today: CalendarDate;
  policy: SubscriptionPolicy;
  /** As the nightly job (or the last change) recorded it. */
  recorded: LifecycleState;
  /** The lifecycle as it is due today. */
  due: LifecycleState;
  /** What every rule uses: the lifecycle's state, or suspended while suspended by hand (a cancellation stays). */
  status: SubscriptionStatus;
  /** The day the lifecycle moves on if nothing is paid; null when only a person moves it. */
  nextChangeOn: CalendarDate | null;
}

/** The status a suspension by hand leaves: suspended, unless the subscription is cancelled, which is further still. */
export function statusWith(lifecycle: SubscriptionStatus, manuallySuspended: boolean): SubscriptionStatus {
  return manuallySuspended && lifecycle !== "cancelled" ? "suspended" : lifecycle;
}

export async function subscriptionToday(tx: OrgTx, row: StoredSubscription, now: Date): Promise<SubscriptionToday> {
  const timeZone = await organizationTimeZone(tx, row.organizationId);
  const policy = await getSubscriptionPolicy(tx);
  const today = calendarDateIn(now, timeZone);
  const recorded: LifecycleState = {
    status: statusOf(row.status),
    since: calendarDateIn(row.statusChangedAt, timeZone),
    trialEndsOn: row.trialEndsOn ? fromDateColumn(row.trialEndsOn) : null,
    paidThrough: row.paidThrough ? fromDateColumn(row.paidThrough) : null,
  };
  const due = dueState(recorded, policy, today);
  const held = row.manualSuspensionAt !== null;
  return {
    timeZone,
    today,
    policy,
    recorded,
    due,
    status: statusWith(due.status, held),
    nextChangeOn: held ? null : (nextStep(due, policy)?.on ?? null),
  };
}

/**
 * Holds the subscription until the transaction ends, so no two changes, nor a change and the nightly job, interleave:
 * each reads the row only once it holds it. FOR NO KEY UPDATE, not FOR UPDATE: a payment's insert takes KEY SHARE on
 * the row (its foreign key), which this lets through, so the two never deadlock. Locking needs the right to update
 * the table, which only the platform role has. Returns the row as it is once held, or null without one.
 */
export async function lockSubscriptionRow(tx: OrgTx, organizationId: string): Promise<StoredSubscription | null> {
  await tx.$queryRaw`SELECT 1 FROM subscription WHERE organization_id = ${organizationId}::uuid FOR NO KEY UPDATE`;
  return tx.subscription.findUnique({ where: { organizationId }, include: withPlan });
}

export function subscriptionNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "SUBSCRIPTION_NOT_FOUND", "This organization has no subscription");
}

/** The held subscription and its state today, or NOT_FOUND: where every change from the console starts. */
export async function lockedSubscription(
  tx: OrgTx,
  organizationId: string,
  now: Date,
): Promise<{ row: StoredSubscription; today: SubscriptionToday }> {
  const row = await lockSubscriptionRow(tx, organizationId);
  if (!row) throw subscriptionNotFound();
  return { row, today: await subscriptionToday(tx, row, now) };
}

/**
 * The columns that record `next` as the lifecycle's state, or none when it is what was recorded. The status begins
 * at the start of its first day in the organization's zone: days in a state count from when it was due, not from
 * when someone noticed.
 */
export function statusColumns(
  today: SubscriptionToday,
  next: LifecycleState,
): { status?: SubscriptionStatus; statusChangedAt?: Date } {
  if (next.status === today.recorded.status && next.since === today.recorded.since) return {};
  return { status: next.status, statusChangedAt: startOfDayIn(next.since, today.timeZone) };
}

/**
 * The lifecycle once the subscription is paid through `paidThrough` by something that pays through `payingThrough`
 * (a payment, or time given): from today on, it is active again from any state, cancelled included; a day already
 * past makes nothing active. Then wherever those dates take it by today, so a correction that moves the day back
 * lands where the job would put it.
 */
export function lifecycleOncePaid(
  today: SubscriptionToday,
  paidThrough: CalendarDate,
  payingThrough: CalendarDate,
): LifecycleState {
  const dated = { ...today.due, paidThrough };
  const revived =
    payingThrough >= today.today && dated.status !== "active"
      ? { ...dated, status: "active" as const, since: today.today }
      : dated;
  return dueState(revived, today.policy, today.today);
}
