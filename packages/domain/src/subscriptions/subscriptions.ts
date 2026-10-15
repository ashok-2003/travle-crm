// The console's changes to one organization's subscription (spec 7.2, 7.3), each recorded in that organization's audit
// log under the platform admin's name. They write columns only the platform role may write, so the console runs them
// in a platform transaction; every query names the organization.
import type {
  ChangePlanInput,
  EndAccessInput,
  SetOverridesInput,
  SetPaidThroughInput,
  SetTrialEndInput,
  StartSubscriptionInput,
  SubscriptionDetails,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError } from "../kernel/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { toDateColumn, todayFor } from "./dates.js";
import { findPlanOnSale } from "./plans.js";
import { subscriptionDetailsOf } from "./rows.js";

const withPlan = { plan: { select: { id: true, key: true, name: true } } } as const;

/** The organization's subscription, or NOT_FOUND. */
export async function getSubscription(tx: OrgTx, organizationId: string): Promise<SubscriptionDetails> {
  const row = await tx.subscription.findUnique({ where: { organizationId }, include: withPlan });
  if (!row) throw new DomainError("NOT_FOUND", "SUBSCRIPTION_NOT_FOUND", "This organization has no subscription");
  return subscriptionDetailsOf(row);
}

/**
 * Holds the subscription until the transaction ends, so two changes (or a change and the lifecycle job) can't
 * interleave, and returns it as it is once held.
 */
export async function lockSubscription(tx: OrgTx, organizationId: string): Promise<SubscriptionDetails> {
  await tx.$queryRaw`SELECT organization_id FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  return getSubscription(tx, organizationId);
}

/**
 * A new organization's subscription (onboarding, spec 7.1): on a trial to its last day, or active and paid through a
 * day. Recorded as "subscription.started".
 */
export async function startSubscription(
  tx: OrgTx,
  by: ConsoleActor,
  input: StartSubscriptionInput & { organizationId: string },
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const { organizationId } = input;
  const plan = await findPlanOnSale(tx, input.planId);
  const today = await todayFor(tx, organizationId, now);
  if (input.trialEndsOn !== null && input.trialEndsOn < today) {
    throw new DomainError("VALIDATION", "TRIAL_END_IN_PAST", "A trial must end today or later");
  }
  if (input.trialEndsOn === null && (input.paidThrough === null || input.paidThrough < today)) {
    throw new DomainError(
      "VALIDATION",
      "PAID_THROUGH_REQUIRED",
      "Give a trial's end, or a paid-through day from today",
    );
  }
  const status: SubscriptionStatus = input.trialEndsOn === null ? "active" : "trial";
  const created = await tx.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      billingCycle: input.billingCycle,
      status,
      statusChangedAt: now,
      trialEndsOn: input.trialEndsOn === null ? null : toDateColumn(input.trialEndsOn),
      paidThrough: input.paidThrough === null ? null : toDateColumn(input.paidThrough),
    },
    include: withPlan,
  });
  const details = subscriptionDetailsOf(created);
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

/** Moves the organization to another plan or billing cycle. The same plan and cycle again changes nothing. */
export async function changePlan(tx: OrgTx, by: ConsoleActor, input: ChangePlanInput): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  if (current.plan.id === input.planId && current.billingCycle === input.billingCycle) return current;
  const plan = await findPlanOnSale(tx, input.planId);
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { planId: plan.id, billingCycle: input.billingCycle },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.plan-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { plan: current.plan.key, billingCycle: current.billingCycle },
    after: { plan: plan.key, billingCycle: input.billingCycle },
  });
  return getSubscription(tx, input.organizationId);
}

/** Extra seats, an agreed price and modules switched on early (spec 7.2). The same values again change nothing. */
export async function setOverrides(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetOverridesInput,
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  const extraModules = [...new Set(input.extraModules)].sort();
  const before = {
    extraSeats: current.extraSeats,
    customPricePaise: current.customPricePaise,
    extraModules: current.extraModules,
  };
  const after = { extraSeats: input.extraSeats, customPricePaise: input.customPricePaise, extraModules };
  if (JSON.stringify(before) === JSON.stringify(after)) return current;
  await tx.subscription.update({ where: { organizationId: input.organizationId }, data: after });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.overrides-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before,
    after,
  });
  return getSubscription(tx, input.organizationId);
}

/** Moves a trial's last day, to today or later. Only while the organization is on its trial. */
export async function setTrialEnd(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetTrialEndInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  if (current.status !== "trial")
    throw new DomainError("CONFLICT", "NOT_IN_TRIAL", "This organization's trial is over");
  if (input.trialEndsOn < (await todayFor(tx, input.organizationId, now))) {
    throw new DomainError("VALIDATION", "TRIAL_END_IN_PAST", "A trial must end today or later");
  }
  if (current.trialEndsOn === input.trialEndsOn) return current;
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { trialEndsOn: toDateColumn(input.trialEndsOn) },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.trial-end-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { trialEndsOn: current.trialEndsOn },
    after: { trialEndsOn: input.trialEndsOn },
  });
  return getSubscription(tx, input.organizationId);
}

/**
 * Sets the last day paid for without a payment: time given (a pilot, goodwill) or a correction. Paid through today or
 * later, the organization is active again, from whatever state, cancelled included.
 */
export async function setPaidThrough(
  tx: OrgTx,
  by: ConsoleActor,
  input: SetPaidThroughInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  const status = statusOnceItPays(current.status, input.paidThrough, await todayFor(tx, input.organizationId, now));
  if (current.paidThrough === input.paidThrough && status === current.status) return current;
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: {
      paidThrough: toDateColumn(input.paidThrough),
      ...(status === current.status ? {} : { status, statusChangedAt: now }),
    },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.paid-through-changed",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { paidThrough: current.paidThrough, status: current.status },
    after: { paidThrough: input.paidThrough, status, reason: input.reason },
  });
  return getSubscription(tx, input.organizationId);
}

/** What paying through a day does: from today on, the organization is active; a day in the past changes nothing. */
export function statusOnceItPays(current: SubscriptionStatus, paidThrough: string, today: string): SubscriptionStatus {
  return paidThrough >= today ? "active" : current;
}

/** Suspends the organization at once (spec 7.3: the owner can only export or pay), whatever it has paid. */
export async function suspend(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  return endAccess(tx, by, input, "suspended", now);
}

/** Cancels the subscription: the data is kept, locked, until a super admin deletes it (spec 5, 7.3). */
export async function cancel(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  now: Date = new Date(),
): Promise<SubscriptionDetails> {
  return endAccess(tx, by, input, "cancelled", now);
}

async function endAccess(
  tx: OrgTx,
  by: ConsoleActor,
  input: EndAccessInput,
  status: "suspended" | "cancelled",
  now: Date,
): Promise<SubscriptionDetails> {
  const current = await lockSubscription(tx, input.organizationId);
  if (current.status === status) return current;
  if (current.status === "cancelled") {
    throw new DomainError("CONFLICT", "SUBSCRIPTION_CANCELLED", "A cancelled subscription comes back only by paying");
  }
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: { status, statusChangedAt: now },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: status === "suspended" ? "subscription.suspended" : "subscription.cancelled",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { status: current.status },
    after: { status, reason: input.reason },
  });
  return getSubscription(tx, input.organizationId);
}
