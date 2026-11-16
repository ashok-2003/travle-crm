// A person checks the payment behind an AI booking's proof (payments to check): confirming records the money on the quote
// chosen for it, else its booking's, else the lead's accepted quote, and with none of those on a quote made from the chat
// (a stand-in, its total what the person confirmed: never an amount the AI wrote, never a sent quote guessed at); it wins
// the lead and marks the AI booking confirmed. Refusing sends it back to waiting for
// payment, its proofs kept. The agent never decides this. Confirming twice records one payment: the
// payment's request id is made from the AI booking's id, and the booking is locked while a person decides.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { uuidFromKey } from "../jobs/index.js";
import { calendarDateIn, DomainError } from "../kernel/index.js";
import { raiseAgreedQuote, recordPayment } from "../quotes/index.js";
import { linkAiBooking } from "./from-ai.js";

const OPEN_STATUSES = ["awaiting_payment", "proof_received"];

export type PaymentRefusalReason = "not_found" | "wrong_amount" | "other";

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

const requestIdOf = (aiBookingId: string) => uuidFromKey(`ai-payment:${aiBookingId}`);

/** A second confirmation naming another amount than the one recorded: refused, so nobody is told a wrong amount. */
export const confirmedOtherAmount = () =>
  new DomainError(
    "CONFLICT",
    "PAYMENT_CONFIRMED_OTHER_AMOUNT",
    "Someone already confirmed this payment with another amount",
  );

/** The AI booking, locked: two people deciding at once take turns, and the second finds what the first did. */
async function lockedAiBooking(tx: OrgTx, bookingId: string) {
  await tx.$queryRaw`SELECT id FROM ai_booking WHERE id = ${bookingId}::uuid FOR UPDATE`;
  const row = await tx.aiBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      leadId: true,
      summary: true,
      details: true,
      status: true,
      proofMessageIds: true,
      bookingId: true,
      quoteId: true,
      expectedPaise: true,
    },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  return row;
}

/** The quote a booking stands on. */
async function quoteOfBooking(tx: OrgTx, bookingId: string | null): Promise<string> {
  if (bookingId === null) throw new Error("The AI booking has neither a quote nor a booking to pay on");
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { quoteId: true } });
  return booking.quoteId;
}

const quoteColumns = { id: true, status: true, title: true } as const;

/**
 * The quote the money goes on: the one chosen for the AI booking (plan 4), its booking's, else the lead's accepted quote.
 * Null otherwise, and a quote is made from the chat: a sent quote may be an older proposal for another trip, so it is never
 * guessed at; accepting it later moves the money onto it (moveStandInPayments).
 */
async function quoteToPay(
  tx: OrgTx,
  row: { leadId: string; quoteId: string | null; bookingId: string | null },
): Promise<{ id: string; status: string; title: string } | null> {
  if (row.quoteId !== null) return tx.quote.findUniqueOrThrow({ where: { id: row.quoteId }, select: quoteColumns });
  if (row.bookingId !== null) {
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: row.bookingId },
      select: { quote: { select: quoteColumns } },
    });
    return booking.quote;
  }
  return tx.quote.findFirst({
    where: { leadId: row.leadId, status: "accepted" },
    orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    select: quoteColumns,
  });
}

/**
 * The title of the quote confirming will pay, for the customer's {trip}: the one quoteToPay finds, else the quote made from
 * the chat, which takes the AI's summary as its title (agreedQuote).
 */
export async function tripPaidOnConfirm(
  tx: OrgTx,
  row: { leadId: string; quoteId: string | null; bookingId: string | null; summary: string },
): Promise<string> {
  return (await quoteToPay(tx, row))?.title ?? row.summary.slice(0, 120);
}

/** Whether the quote stands in for one (made from a chat for an AI booking's booking). */
const isStandIn = async (tx: OrgTx, quoteId: string) =>
  (await tx.booking.findFirst({ where: { quoteId, quotePlaceholder: true }, select: { id: true } })) !== null;

/** A person confirms the money arrived. Returns the lead and the quote it was recorded on; a repeat returns the same. */
export async function confirmAiPayment(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string; amountPaise: number; reference: string },
  now: Date,
): Promise<{ leadId: string; quoteId: string }> {
  const row = await lockedAiBooking(tx, input.bookingId);
  if (row.status === "confirmed") {
    const earlier = await tx.quotePayment.findFirst({
      where: { requestId: requestIdOf(row.id) },
      select: { quoteId: true, amountPaise: true },
    });
    if (earlier === null) throw new DomainError("CONFLICT", "AI_BOOKING_NOT_OPEN", "This booking was decided already");
    if (Number(earlier.amountPaise) !== input.amountPaise) throw confirmedOtherAmount();
    return { leadId: row.leadId, quoteId: earlier.quoteId };
  }
  if (!OPEN_STATUSES.includes(row.status))
    throw new DomainError("CONFLICT", "AI_BOOKING_NOT_OPEN", "This booking was decided already");
  const details = (row.details ?? {}) as Record<string, unknown>;
  const link = (quoteId: string | null) =>
    linkAiBooking(
      tx,
      access,
      {
        leadId: row.leadId,
        summary: row.summary,
        details: {
          package: textOf(details.package),
          dates: textOf(details.dates),
          travellers: textOf(details.travellers),
          pickup: textOf(details.pickup),
          // A quote made from the chat holds what the person confirmed, never the amount the AI wrote (it may be invented):
          // the payment always fits it, and later money raises it (raiseAgreedQuote).
          amountPaise: input.amountPaise,
        },
        proofMessageIds: row.proofMessageIds,
        linkedBookingId: row.bookingId,
        quoteId,
      },
      now,
    );
  // An accepted quote's booking is found (or made) first. With none, linking makes a quote from the chat and its booking.
  // Either way one quote, one booking.
  const target = await quoteToPay(tx, row);
  let bookingId: string | null = null;
  if (target === null || target.status === "accepted") bookingId = await link(target?.id ?? null);
  const quoteId = target?.id ?? (await quoteOfBooking(tx, bookingId));
  // A quote made from an earlier chat grows to take the money; only a quote a person made refuses more than its total.
  if (target !== null && (await isStandIn(tx, quoteId)))
    await raiseAgreedQuote(tx, access, { quoteId, payingPaise: input.amountPaise });
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const paid = await recordPayment(
    tx,
    access,
    {
      quoteId,
      amountPaise: input.amountPaise,
      receivedOn: calendarDateIn(now, timeZone),
      method: "upi",
      reference: input.reference,
      requestId: requestIdOf(row.id),
    },
    now,
  ).catch((error: unknown) => {
    if (error instanceof DomainError && error.reason === "PAYMENT_EXCEEDS_BALANCE")
      throw new DomainError("CONFLICT", "AI_PAYMENT_OVER_TOTAL", "That is more than the trip's total");
    throw error;
  });
  bookingId ??= await link(quoteId);
  // Moves the lead to won; a no-op (no second change or notice) when the payment already did.
  await advanceLeadStage(tx, access, { leadId: row.leadId, stage: "won" }, now);
  await tx.aiBooking.update({
    where: { id: row.id },
    data: {
      status: "confirmed",
      decidedBy: access.userId,
      decidedAt: now,
      bookingId,
      quoteId,
    },
  });
  await recordAudit(tx, access, {
    action: "ai.booking-decided",
    entityType: "ai_booking",
    entityId: row.id,
    after: { status: "confirmed", paymentId: paid.paymentId, quoteId, bookingId, amountPaise: input.amountPaise },
  });
  return { leadId: row.leadId, quoteId };
}

/** A person couldn't match the money: the booking waits for payment again, its proofs kept, and the refusal is audited. */
export async function refuseAiPayment(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string; reason: PaymentRefusalReason },
  now: Date,
): Promise<{ leadId: string }> {
  const row = await lockedAiBooking(tx, input.bookingId);
  if (row.status !== "proof_received")
    throw new DomainError("CONFLICT", "AI_BOOKING_NOT_OPEN", "There is no payment proof to refuse");
  await tx.aiBooking.update({
    where: { id: row.id },
    data: { status: "awaiting_payment", decidedBy: access.userId, decidedAt: now },
  });
  await recordAudit(tx, access, {
    action: "ai.payment-refused",
    entityType: "ai_booking",
    entityId: row.id,
    after: { status: "awaiting_payment", reason: input.reason },
  });
  return { leadId: row.leadId };
}
