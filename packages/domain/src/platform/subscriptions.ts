// The console's changes to an organization's subscription (spec 7.2-7.4). Each runs in one platform transaction, and
// the subscriptions module records it in that organization's audit log under the platform admin's name. Every one
// that changes something also goes in the platform log, so a super admin can review all that platform staff changed
// without opening each organization's log (ADR 0020).
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
import * as subscriptions from "../subscriptions/index.js";
import {
  logBillingChange,
  loggedChange,
  overridesShown,
  paidShown,
  planShown,
  statusShown,
  suspensionShown,
  trialShown,
} from "./billing-log.js";
import type { PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

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
  const logged = { action: "subscription.plan-changed", shown: planShown };
  return loggedChange(services, staff, input.organizationId, logged, (tx) =>
    subscriptions.changePlan(tx, staff, input),
  );
}

export async function setOverrides(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetOverridesInput,
): Promise<SubscriptionDetails> {
  const logged = { action: "subscription.overrides-changed", shown: overridesShown };
  return loggedChange(services, staff, input.organizationId, logged, (tx) =>
    subscriptions.setOverrides(tx, staff, input),
  );
}

export async function setTrialEnd(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetTrialEndInput,
): Promise<SubscriptionDetails> {
  const logged = { action: "subscription.trial-end-changed", shown: trialShown };
  return loggedChange(services, staff, input.organizationId, logged, (tx) =>
    subscriptions.setTrialEnd(tx, staff, input),
  );
}

/** Time given without a payment, or a correction. */
export async function setPaidThrough(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetPaidThroughInput,
): Promise<SubscriptionDetails> {
  const logged = { action: "subscription.paid-through-changed", shown: paidShown };
  return loggedChange(services, staff, input.organizationId, logged, (tx) =>
    subscriptions.setPaidThrough(tx, staff, input),
  );
}

/**
 * Logged with the payment's id, amount and days, and the subscription's paid-through day and state before and after;
 * never its reference, which may name the payer.
 */
export async function recordPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: RecordPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction(async (tx) => {
    const before = paidShown(await subscriptions.lockSubscription(tx, input.organizationId));
    const payment = await subscriptions.recordPayment(tx, staff, input);
    const after = paidShown(await subscriptions.getSubscription(tx, input.organizationId));
    await logBillingChange(tx, staff, input.organizationId, {
      action: "subscription.payment-recorded",
      before,
      after: {
        paymentId: payment.id,
        amountPaise: payment.amountPaise,
        paidOn: payment.paidOn,
        paysThrough: payment.paidThrough,
        ...after,
      },
    });
    return payment;
  });
}

export async function voidPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: VoidPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction(async (tx) => {
    await subscriptions.lockSubscription(tx, input.organizationId);
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
  const logged = { action: "subscription.suspended", shown: suspensionShown };
  return loggedChange(services, staff, input.organizationId, logged, (tx) => subscriptions.suspend(tx, staff, input));
}

/** The only way out of a suspension made by hand. Super admins only, which the console's procedure checks. */
export async function liftSuspension(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  const logged = { action: "subscription.suspension-lifted", shown: suspensionShown };
  return loggedChange(services, staff, input.organizationId, logged, (tx) =>
    subscriptions.liftSuspension(tx, staff, input),
  );
}

export async function cancel(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  const logged = { action: "subscription.cancelled", shown: statusShown };
  return loggedChange(services, staff, input.organizationId, logged, (tx) => subscriptions.cancel(tx, staff, input));
}
