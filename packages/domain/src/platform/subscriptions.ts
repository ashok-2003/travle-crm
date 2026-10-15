// The console's changes to an organization's subscription (spec 7.2-7.4). Each runs in one platform transaction, and
// the subscriptions module records it in that organization's audit log under the platform admin's name. The billing
// changes support may make freely (time given, a payment voided, a plan changed, a cancellation) also go in the
// platform log, so a super admin can review them without opening each organization's log (ADR 0020).
import type {
  ChangePlanInput,
  EndAccessInput,
  RecordPaymentInput,
  SetOverridesInput,
  SetPaidThroughInput,
  SetTrialEndInput,
  SubscriptionDetails,
  SubscriptionPayment,
  VoidPaymentInput,
} from "@travel-crm/contracts/subscriptions";
import type { PlatformTx } from "@travel-crm/db/platform";
import type { AuditSnapshot } from "../audit/index.js";
import * as subscriptions from "../subscriptions/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/**
 * A billing change in the platform log, beside the organization's own entry: ids, days and amounts in paise and who
 * acted, never the reason typed, which may name someone. Only when something changed, as the organization's log.
 */
async function logBillingChange(
  tx: PlatformTx,
  staff: PlatformActor,
  organizationId: string,
  change: { action: string; before?: AuditSnapshot; after: AuditSnapshot },
): Promise<void> {
  await recordPlatformAudit(tx, staff, {
    ...change,
    targetType: "subscription",
    targetId: organizationId,
    targetOrganizationId: organizationId,
  });
}

/**
 * The subscription held, as every change holds it first, and as it is once held: what the change in the same
 * transaction starts from.
 */
function heldSubscription(tx: PlatformTx, organizationId: string): Promise<SubscriptionDetails> {
  return subscriptions.lockSubscription(tx, organizationId);
}

/** An organization's subscription and its payments, newest first. */
export async function getSubscription(
  services: PlatformServices,
  organizationId: string,
): Promise<{ subscription: SubscriptionDetails; payments: SubscriptionPayment[] }> {
  return services.platformDb.transaction(async (tx) => ({
    subscription: await subscriptions.getSubscription(tx, organizationId),
    payments: await subscriptions.listPayments(tx, organizationId),
  }));
}

export async function changePlan(
  services: PlatformServices,
  staff: PlatformActor,
  input: ChangePlanInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction(async (tx) => {
    const before = await heldSubscription(tx, input.organizationId);
    const after = await subscriptions.changePlan(tx, staff, input);
    if (before.plan.id !== after.plan.id || before.billingCycle !== after.billingCycle) {
      await logBillingChange(tx, staff, input.organizationId, {
        action: "subscription.plan-changed",
        before: { planId: before.plan.id, billingCycle: before.billingCycle },
        after: { planId: after.plan.id, billingCycle: after.billingCycle },
      });
    }
    return after;
  });
}

export async function setOverrides(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetOverridesInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setOverrides(tx, staff, input));
}

export async function setTrialEnd(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetTrialEndInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setTrialEnd(tx, staff, input));
}

/** Time given without a payment, or a correction: logged with the paid-through day and the state, before and after. */
export async function setPaidThrough(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetPaidThroughInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction(async (tx) => {
    const before = await heldSubscription(tx, input.organizationId);
    const after = await subscriptions.setPaidThrough(tx, staff, input);
    if (before.paidThrough !== after.paidThrough || before.status !== after.status) {
      await logBillingChange(tx, staff, input.organizationId, {
        action: "subscription.paid-through-changed",
        before: { paidThrough: before.paidThrough, status: before.status },
        after: { paidThrough: after.paidThrough, status: after.status },
      });
    }
    return after;
  });
}

export async function recordPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: RecordPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction((tx) => subscriptions.recordPayment(tx, staff, input));
}

export async function voidPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: VoidPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction(async (tx) => {
    await heldSubscription(tx, input.organizationId);
    const before = await subscriptions.listPayments(tx, input.organizationId);
    const voided = await subscriptions.voidPayment(tx, staff, input);
    if (before.some((payment) => payment.id === voided.id && payment.voided === null)) {
      await logBillingChange(tx, staff, input.organizationId, {
        action: "subscription.payment-voided",
        after: {
          paymentId: voided.id,
          amountPaise: voided.amountPaise,
          paidOn: voided.paidOn,
          paidThrough: voided.paidThrough,
        },
      });
    }
    return voided;
  });
}

export async function suspend(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.suspend(tx, staff, input));
}

export async function cancel(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction(async (tx) => {
    const before = await heldSubscription(tx, input.organizationId);
    const after = await subscriptions.cancel(tx, staff, input);
    if (before.status !== after.status) {
      await logBillingChange(tx, staff, input.organizationId, {
        action: "subscription.cancelled",
        before: { status: before.status },
        after: { status: after.status },
      });
    }
    return after;
  });
}
