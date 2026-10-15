// The console's changes to a subscription's dates (spec 7.3): a trial's last day, and the last day paid for without a
// payment (time given, or a correction). Each decides on the state due today, never the stored one, and writes that
// state with its change, so whether the nightly job has run changes nothing.
import type { SetPaidThroughInput, SetTrialEndInput, SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError, parseCalendarDate } from "../kernel/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { toDateColumn } from "./dates.js";
import { dueState } from "./lifecycle.js";
import { lifecycleOncePaid, lockedSubscription, statusColumns, statusWith } from "./state.js";
import { getSubscription } from "./subscriptions.js";

/** Moves a trial's last day, to today or later. Only while the trial lasts today. */
export async function setTrialEnd(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetTrialEndInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { today } = await lockedSubscription(tx, input.organizationId, now);
  if (today.due.status !== "trial") {
    throw new DomainError("CONFLICT", "NOT_IN_TRIAL", "This organization's trial is over");
  }
  if (input.trialEndsOn < today.today) {
    throw new DomainError("VALIDATION", "TRIAL_END_IN_PAST", "A trial must end today or later");
  }
  if (today.due.trialEndsOn === input.trialEndsOn) return getSubscription(tx, input.organizationId, now);
  const trialEndsOn = parseCalendarDate(input.trialEndsOn);
  const next = dueState({ ...today.due, trialEndsOn }, today.policy, today.today);
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { trialEndsOn: toDateColumn(trialEndsOn), ...statusColumns(today, next) },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.trial-end-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { trialEndsOn: today.due.trialEndsOn },
    after: { trialEndsOn: input.trialEndsOn },
  });
  return getSubscription(tx, input.organizationId, now);
}

/**
 * Sets the last day paid for without a payment: time given (a pilot, goodwill) or a correction. Paid through today or
 * later, the organization is active again from whatever state, cancelled included; moved back, it is wherever the
 * corrected dates take it today. A suspension made by hand stays.
 */
export async function setPaidThrough(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetPaidThroughInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { row, today } = await lockedSubscription(tx, input.organizationId, now);
  const paidThrough = parseCalendarDate(input.paidThrough);
  const next = lifecycleOncePaid(today, paidThrough, paidThrough);
  const status = statusColumns(today, next);
  if (today.due.paidThrough === paidThrough && status.status === undefined) {
    return getSubscription(tx, input.organizationId, now);
  }
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { paidThrough: toDateColumn(paidThrough), ...status },
  });
  const held = row.manualSuspensionAt !== null;
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.paid-through-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { paidThrough: today.due.paidThrough, status: today.status },
    after: { paidThrough, status: statusWith(next.status, held), reason: input.reason },
  });
  return getSubscription(tx, input.organizationId, now);
}
