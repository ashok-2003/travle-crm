// The money on a quote (step 3, P0): what is due and when (the advance, the balance), and what the customer paid, as staff
// record it (by UPI to the agency's own id, a bank transfer, cash). Money never passes through us. A payment is never
// deleted, only voided with who and when; the first payment on a sent quote makes it accepted and its lead Won, and
// voiding that payment puts both back. Every change takes the quote's row lock, so two taps never both count. All audited.
import { leadStage } from "@travel-crm/contracts/crm";
import type { AddInstallmentInput, RecordPaymentInput } from "@travel-crm/contracts/quotes";
import { MAX_INSTALLMENTS } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage, retreatLeadStage } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { assertDraft, findQuoteForChange, paidOf } from "./quote-rows.js";

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

export async function addInstallment(tx: OrgTx, access: MemberAccess, input: AddInstallmentInput): Promise<void> {
  const quote = await findQuoteForChange(tx, access, input.quoteId);
  assertDraft(quote);
  if (quote.installments.length >= MAX_INSTALLMENTS) {
    throw new DomainError("LIMIT_REACHED", "TOO_MANY_INSTALLMENTS", "A quote has twelve payments due at most");
  }
  const due = quote.installments.reduce((total, row) => total + Number(row.amountPaise), 0);
  if (due + input.amountPaise > Number(quote.totalPaise)) {
    throw new DomainError(
      "CONFLICT",
      "INSTALLMENTS_EXCEED_TOTAL",
      "The payments due can't add up to more than the total",
    );
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
  const quote = await findQuoteForChange(tx, access, due.quoteId);
  assertDraft(quote);
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

/**
 * Records money received on a sent or accepted quote, never more than is left to pay. The same requestId again (a double
 * tap, a retry) gives back the payment already recorded. The first payment on a sent quote accepts it and makes its lead
 * Won, and remembers what it changed, for a void.
 */
export async function recordPayment(
  tx: OrgTx,
  access: MemberAccess,
  input: RecordPaymentInput,
  now: Date,
): Promise<{ paymentId: string }> {
  const quote = await findQuoteForChange(tx, access, input.quoteId);
  const again = await tx.quotePayment.findFirst({
    where: { requestId: input.requestId },
    select: { id: true, quoteId: true },
  });
  if (again !== null) {
    if (again.quoteId !== quote.id)
      throw new DomainError("CONFLICT", "REQUEST_REUSED", "This request was used already");
    return { paymentId: again.id };
  }
  if (quote.status === "declined") {
    throw new DomainError("CONFLICT", "QUOTE_DECLINED", "This quote was declined");
  }
  if (quote.status === "replaced") {
    throw new DomainError("CONFLICT", "QUOTE_REPLACED", "This quote was replaced by a new version");
  }
  if (quote.status === "draft") {
    throw new DomainError("CONFLICT", "QUOTE_NOT_SENT", "Send the quote before recording a payment on it");
  }
  const left = Number(quote.totalPaise) - paidOf(quote);
  if (input.amountPaise > left) {
    throw new DomainError("CONFLICT", "PAYMENT_EXCEEDS_BALANCE", "That is more than is left to pay on this quote");
  }
  const accepts = quote.status !== "accepted";
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: quote.leadId }, select: { stage: true } });
  const row = await tx.quotePayment.create({
    data: {
      quoteId: quote.id,
      amountPaise: BigInt(input.amountPaise),
      receivedOn: asDate(input.receivedOn),
      method: input.method,
      reference: input.reference,
      requestId: input.requestId,
      recordedBy: access.userId,
      quoteStatusBefore: accepts ? quote.status : null,
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
  if (accepts) await tx.quote.update({ where: { id: quote.id }, data: { status: "accepted", acceptedAt: now } });
  if (await advanceLeadStage(tx, access, { leadId: quote.leadId, stage: "won" }, now)) {
    await tx.quotePayment.update({ where: { id: row.id }, data: { leadStageBefore: lead.stage } });
  }
  return { paymentId: row.id };
}

/**
 * Voids a payment recorded by mistake. A payment with a receipt is not voided: the receipt is a numbered document that
 * can't be taken back. Voiding the payment that accepted the quote puts the quote and its lead back as they were.
 */
export async function voidPayment(tx: OrgTx, access: MemberAccess, paymentId: string, now: Date): Promise<void> {
  const found = await tx.quotePayment.findUnique({ where: { id: paymentId }, select: { quoteId: true } });
  if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const quote = await findQuoteForChange(tx, access, found.quoteId);
  const payment = await tx.quotePayment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      id: true,
      amountPaise: true,
      voidedAt: true,
      receiptDocumentId: true,
      quoteStatusBefore: true,
      leadStageBefore: true,
    },
  });
  if (payment.voidedAt !== null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (payment.receiptDocumentId !== null) {
    throw new DomainError(
      "CONFLICT",
      "PAYMENT_HAS_RECEIPT",
      "A receipt was issued for this payment, so it can't be voided",
    );
  }
  await tx.quotePayment.update({ where: { id: payment.id }, data: { voidedAt: now, voidedBy: access.userId } });
  await recordAudit(tx, access, {
    action: "quote.payment-voided",
    entityType: "quote",
    entityId: quote.id,
    before: { paymentId: payment.id, amountPaise: Number(payment.amountPaise) },
  });
  const othersLeft = quote.payments.some((other) => other.id !== payment.id);
  if (othersLeft) return;
  if (payment.quoteStatusBefore !== null && quote.status === "accepted" && quote.acceptedName === null) {
    await tx.quote.update({ where: { id: quote.id }, data: { status: payment.quoteStatusBefore, acceptedAt: null } });
  }
  if (payment.leadStageBefore !== null) {
    await retreatLeadStage(
      tx,
      access,
      { leadId: quote.leadId, from: leadStage.parse(payment.leadStageBefore), to: "won" },
      now,
    );
  }
}
