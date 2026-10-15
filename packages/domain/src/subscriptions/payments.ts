// Payments recorded against a subscription (spec 7.3, 7.4): recording one pays the organization through a day and, from
// today on, makes it active again. Payments are never deleted; a mistaken one is voided, which changes no dates.
import type { RecordPaymentInput, SubscriptionPayment, VoidPaymentInput } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError } from "../kernel/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { toDateColumn, todayFor } from "./dates.js";
import { paymentOf } from "./rows.js";
import { lockSubscription, statusOnceItPays } from "./subscriptions.js";

/** A payment a provider reported (Razorpay, later), found again by its own id when its webhook is repeated. */
export interface ProviderPayment {
  provider: "razorpay";
  providerPaymentId: string;
}

/**
 * Records a payment and moves the paid-through day to at least the payment's. Recorded as
 * "subscription.payment-recorded" with the amount and dates. With a provider's payment id, a repeat records nothing
 * and returns the payment already recorded.
 */
export async function recordPayment(
  tx: OrgTx,
  by: ConsoleActor,
  input: RecordPaymentInput,
  options: { now?: Date; provider?: ProviderPayment } = {},
): Promise<SubscriptionPayment> {
  const now = options.now ?? new Date();
  const current = await lockSubscription(tx, input.organizationId);
  if (options.provider) {
    const repeated = await tx.subscriptionPayment.findUnique({
      where: {
        organizationId_provider_providerPaymentId: {
          organizationId: input.organizationId,
          provider: options.provider.provider,
          providerPaymentId: options.provider.providerPaymentId,
        },
      },
    });
    if (repeated) return paymentOf(repeated);
  }
  const paidThrough =
    current.paidThrough !== null && current.paidThrough > input.paidThrough ? current.paidThrough : input.paidThrough;
  const status = statusOnceItPays(current.status, paidThrough, await todayFor(tx, input.organizationId, now));
  const payment = await tx.subscriptionPayment.create({
    data: {
      organizationId: input.organizationId,
      amountPaise: input.amountPaise,
      paidOn: toDateColumn(input.paidOn),
      paidThrough: toDateColumn(input.paidThrough),
      reference: input.reference,
      provider: options.provider?.provider ?? "manual",
      providerPaymentId: options.provider?.providerPaymentId ?? null,
      recordedBy: by.userId,
    },
  });
  await tx.subscription.update({
    where: { organizationId: input.organizationId },
    data: {
      paidThrough: toDateColumn(paidThrough),
      ...(status === current.status ? {} : { status, statusChangedAt: now }),
    },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.payment-recorded",
    entityType: "subscription",
    entityId: input.organizationId,
    before: { paidThrough: current.paidThrough, status: current.status },
    after: {
      paymentId: payment.id,
      amountPaise: input.amountPaise,
      paidOn: input.paidOn,
      paidThrough,
      status,
    },
  });
  return paymentOf(payment);
}

/** Marks a payment recorded by mistake as void. Dates and status stay as they are: correct them on their own. */
export async function voidPayment(tx: OrgTx, by: ConsoleActor, input: VoidPaymentInput): Promise<SubscriptionPayment> {
  const payment = await tx.subscriptionPayment.findFirst({
    where: { organizationId: input.organizationId, id: input.paymentId },
  });
  if (!payment) throw new DomainError("NOT_FOUND", "PAYMENT_NOT_FOUND", "No such payment");
  if (payment.voidedAt) return paymentOf(payment);
  const voided = await tx.subscriptionPayment.update({
    where: { id: payment.id },
    data: { voidedAt: new Date(), voidedBy: by.userId, voidReason: input.reason },
  });
  await recordAudit(tx, actorIn(input.organizationId, by), {
    action: "subscription.payment-voided",
    entityType: "subscription",
    entityId: input.organizationId,
    after: { paymentId: payment.id, amountPaise: payment.amountPaise, reason: input.reason },
  });
  return paymentOf(voided);
}

/** The organization's payments, newest first, voided ones included. */
export async function listPayments(tx: OrgTx, organizationId: string): Promise<SubscriptionPayment[]> {
  const payments = await tx.subscriptionPayment.findMany({
    where: { organizationId },
    orderBy: [{ paidOn: "desc" }, { recordedAt: "desc" }],
  });
  return payments.map(paymentOf);
}
