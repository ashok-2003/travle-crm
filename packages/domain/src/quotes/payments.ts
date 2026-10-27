// The money on a quote (step 3, P0): what is due and when (the advance, the balance), and what the customer paid, as staff
// record it (by UPI to the agency's own id, a bank transfer, cash). Money never passes through us. A payment is never
// deleted, only voided with who and when; the first payment on an accepted quote makes its lead Won. All audited.
import type { AddInstallmentInput, RecordPaymentInput } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { MAX_INSTALLMENTS } from "@travel-crm/contracts/quotes";
import { findQuoteInScope } from "./quote-rows.js";

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

export async function addInstallment(tx: OrgTx, access: MemberAccess, input: AddInstallmentInput): Promise<void> {
  const quote = await findQuoteInScope(tx, access, input.quoteId);
  if (quote.installments.length >= MAX_INSTALLMENTS) {
    throw new DomainError("LIMIT_REACHED", "TOO_MANY_INSTALLMENTS", "A quote has twelve payments due at most");
  }
  const row = await tx.quoteInstallment.create({
    data: { quoteId: quote.id, label: input.label, amountPaise: BigInt(input.amountPaise), dueOn: asDate(input.dueOn) },
    select: { id: true },
  });
  await recordAudit(tx, access, {
    action: "quote.installment-added",
    entityType: "quote",
    entityId: quote.id,
    after: { installmentId: row.id, amountPaise: input.amountPaise, dueOn: input.dueOn },
  });
}

export async function removeInstallment(tx: OrgTx, access: MemberAccess, installmentId: string): Promise<void> {
  const due = await tx.quoteInstallment.findUnique({
    where: { id: installmentId },
    select: { id: true, quoteId: true, amountPaise: true, dueOn: true },
  });
  if (due === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const quote = await findQuoteInScope(tx, access, due.quoteId);
  await tx.quoteInstallment.delete({ where: { id: due.id } });
  await recordAudit(tx, access, {
    action: "quote.installment-removed",
    entityType: "quote",
    entityId: quote.id,
    before: {
      installmentId: due.id,
      amountPaise: Number(due.amountPaise),
      dueOn: due.dueOn.toISOString().slice(0, 10),
    },
  });
}

export async function recordPayment(
  tx: OrgTx,
  access: MemberAccess,
  input: RecordPaymentInput,
  now: Date,
): Promise<{ paymentId: string }> {
  const quote = await findQuoteInScope(tx, access, input.quoteId);
  if (quote.status === "declined") {
    throw new DomainError("CONFLICT", "QUOTE_DECLINED", "This quote was declined");
  }
  const row = await tx.quotePayment.create({
    data: {
      quoteId: quote.id,
      amountPaise: BigInt(input.amountPaise),
      receivedOn: asDate(input.receivedOn),
      method: input.method,
      reference: input.reference,
      recordedBy: access.userId,
    },
    select: { id: true },
  });
  await recordAudit(tx, access, {
    action: "quote.payment-recorded",
    entityType: "quote",
    entityId: quote.id,
    after: { paymentId: row.id, amountPaise: input.amountPaise, method: input.method, receivedOn: input.receivedOn },
  });
  // Money paid on a quote is a sale: accepted, if nobody marked it, and the lead Won.
  if (quote.status !== "accepted") {
    await tx.quote.update({ where: { id: quote.id }, data: { status: "accepted", acceptedAt: now } });
  }
  await advanceLeadStage(tx, access, { leadId: quote.leadId, stage: "won" }, now);
  return { paymentId: row.id };
}

export async function voidPayment(tx: OrgTx, access: MemberAccess, paymentId: string, now: Date): Promise<void> {
  const payment = await tx.quotePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, quoteId: true, amountPaise: true, voidedAt: true },
  });
  if (payment?.voidedAt !== null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const quote = await findQuoteInScope(tx, access, payment.quoteId);
  await tx.quotePayment.update({ where: { id: payment.id }, data: { voidedAt: now, voidedBy: access.userId } });
  await recordAudit(tx, access, {
    action: "quote.payment-voided",
    entityType: "quote",
    entityId: quote.id,
    before: { paymentId: payment.id, amountPaise: Number(payment.amountPaise) },
  });
}
