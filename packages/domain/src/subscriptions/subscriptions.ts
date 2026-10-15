// The console's view of one organization's subscription, starting it, and changing its plan and overrides (spec 7.2),
// each change recorded in that organization's audit log under the platform admin's name. They write columns only the
// platform role may write, so the console runs them in a platform transaction; every query names the organization.
import type {
  ChangePlanInput,
  SetOverridesInput,
  StartSubscriptionInput,
  SubscriptionDetails,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { isUniqueViolation } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { addDays, calendarDateIn, DomainError, startOfDayIn } from "../kernel/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { toDateColumn } from "./dates.js";
import { subscriptionDetailsOf } from "./details.js";
import { findPlanOnSale } from "./plans.js";
import { getSubscriptionPolicy } from "./policy.js";
import { assertSoldOn } from "./pricing.js";
import { withPlan } from "./rows.js";
import { lockedSubscription, subscriptionNotFound, subscriptionToday } from "./state.js";

/** The organization's subscription with its state today, or NOT_FOUND. */
export async function getSubscription(
  tx: OrgTx,
  organizationId: string,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const row = await tx.subscription.findUnique({ where: { organizationId }, include: withPlan });
  if (!row) throw subscriptionNotFound();
  return subscriptionDetailsOf(row, await subscriptionToday(tx, row, now));
}

/**
 * Holds the organization's subscription until the transaction ends (as every change here does first), and returns it
 * as it is once held, with its state today; NOT_FOUND without one. For platform work that must not race a payment,
 * such as a purge's last look at the subscription. The platform role only.
 */
export async function lockSubscription(
  tx: OrgTx,
  organizationId: string,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { row, today } = await lockedSubscription(tx, organizationId, now);
  return subscriptionDetailsOf(row, today);
}

/**
 * A new organization's subscription (onboarding, spec 7.1): on a trial, to the day given or for the policy's trial
 * days, or active and paid through a day; on a cycle the plan is sold on. Recorded as "subscription.started".
 */
export async function startSubscription(
  tx: OrgTx,
  by: ConsoleActor,
  input: StartSubscriptionInput & { organizationId: string },
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { organizationId } = input;
  const plan = await findPlanOnSale(tx, input.planId);
  assertSoldOn(plan, input.billingCycle);
  const timeZone = await organizationTimeZone(tx, organizationId);
  const today = calendarDateIn(now, timeZone);
  // Left out, the trial is the policy's days, today the first of them.
  const trialEndsOn =
    input.trialEndsOn === undefined
      ? addDays(today, (await getSubscriptionPolicy(tx)).trialDays - 1)
      : input.trialEndsOn;
  if (trialEndsOn !== null && trialEndsOn < today) {
    throw new DomainError("VALIDATION", "TRIAL_END_IN_PAST", "A trial must end today or later");
  }
  if (trialEndsOn === null && (input.paidThrough === null || input.paidThrough < today)) {
    throw new DomainError(
      "VALIDATION",
      "PAID_THROUGH_REQUIRED",
      "Give a trial's end, or a paid-through day from today",
    );
  }
  const status: SubscriptionStatus = trialEndsOn === null ? "active" : "trial";
  const created = await tx.subscription
    .create({
      data: {
        organizationId,
        planId: plan.id,
        billingCycle: input.billingCycle,
        status,
        statusChangedAt: startOfDayIn(today, timeZone),
        trialEndsOn: trialEndsOn === null ? null : toDateColumn(trialEndsOn),
        paidThrough: input.paidThrough === null ? null : toDateColumn(input.paidThrough),
      },
      include: withPlan,
    })
    .catch((error: unknown) => {
      if (!isUniqueViolation(error)) throw error;
      throw new DomainError("CONFLICT", "SUBSCRIPTION_EXISTS", "This organization already has a subscription");
    });
  const details = subscriptionDetailsOf(created, await subscriptionToday(tx, created, now));
  await recordAudit(tx, actorIn(organizationId, by), {
    action: "subscription.started",
    entityType: "subscription",
    entityId: organizationId,
    after: {
      plan: plan.key,
      billingCycle: details.billingCycle,
      status,
      trialEndsOn: details.trialEndsOn,
      paidThrough: details.paidThrough,
    },
  });
  return details;
}

/**
 * Moves the organization to another plan or billing cycle, one the plan is sold on. The same plan and cycle again
 * changes nothing.
 */
export async function changePlan(
  tx: OrgTx,
  by: ConsoleActor,
  input: ChangePlanInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { row, today } = await lockedSubscription(tx, input.organizationId, now);
  if (row.plan.id === input.planId && row.billingCycle === input.billingCycle) {
    return subscriptionDetailsOf(row, today);
  }
  const plan = await findPlanOnSale(tx, input.planId);
  assertSoldOn(plan, input.billingCycle);
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { planId: plan.id, billingCycle: input.billingCycle },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.plan-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { plan: row.plan.key, billingCycle: row.billingCycle },
    after: { plan: plan.key, billingCycle: input.billingCycle },
  });
  return getSubscription(tx, input.organizationId, now);
}

/** Extra seats, an agreed price and modules switched on early (spec 7.2). The same values again change nothing. */
export async function setOverrides(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetOverridesInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { row, today } = await lockedSubscription(tx, input.organizationId, now);
  const extraModules = [...new Set(input.extraModules)].sort();
  const before = { extraSeats: row.extraSeats, customPricePaise: row.customPricePaise, extraModules: row.extraModules };
  const after = { extraSeats: input.extraSeats, customPricePaise: input.customPricePaise, extraModules };
  const unchanged =
    before.extraSeats === after.extraSeats &&
    before.customPricePaise === after.customPricePaise &&
    before.extraModules.join() === after.extraModules.join();
  if (unchanged) return subscriptionDetailsOf(row, today);
  await tx.subscription.update({ where: { organizationId: input.organizationId }, data: after });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.overrides-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before,
    after,
  });
  return getSubscription(tx, input.organizationId, now);
}
