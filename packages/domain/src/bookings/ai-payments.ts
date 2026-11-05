// A person checks the payment behind an AI booking's proof (payments to check): confirming records the money on the
// booking's quote (made first when the lead has none), wins the lead and marks the AI booking confirmed; refusing sends it
// back to waiting for payment, its proofs kept. The agent never decides this. Confirming twice records one payment: the
// payment's request id is made from the AI booking's id, and the booking is locked while a person decides.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { uuidFromKey } from "../jobs/index.js";
import { calendarDateIn, DomainError } from "../kernel/index.js";
import { recordPayment } from "../quotes/index.js";
import { linkAiBooking } from "./from-ai.js";

const OPEN_STATUSES = ["awaiting_payment", "proof_received"];

export type PaymentRefusalReason = "not_found" | "wrong_amount" | "other";

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

/** The advance the booking asks: the plan 4 amount when set, else what the AI wrote down as the amount, else unknown. */
export function expectedAdvanceOf(booking: { expectedPaise: bigint | null; details: unknown }): number | null {
  if (booking.expectedPaise !== null) return Number(booking.expectedPaise);
  const details = (booking.details ?? {}) as Record<string, unknown>;
  return paiseFromRupeesText(textOf(details.amount));
}

const requestIdOf = (aiBookingId: string) => uuidFromKey(`ai-payment:${aiBookingId}`);

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
      select: { quoteId: true },
    });
    if (earlier === null) throw new DomainError("CONFLICT", "AI_BOOKING_NOT_OPEN", "This booking was decided already");
    return { leadId: row.leadId, quoteId: earlier.quoteId };
  }
  if (!OPEN_STATUSES.includes(row.status))
    throw new DomainError("CONFLICT", "AI_BOOKING_NOT_OPEN", "This booking was decided already");
  const details = (row.details ?? {}) as Record<string, unknown>;
  const written = paiseFromRupeesText(textOf(details.amount)) ?? 0;
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
          // With no amount written, the quote is for what the person confirmed, so the payment fits it.
          amountPaise: written > 0 ? written : input.amountPaise,
        },
        proofMessageIds: row.proofMessageIds,
        linkedBookingId: row.bookingId,
        quoteId,
      },
      now,
    );
  // A quote set for it (plan 4) is the one paid, even if only sent: its first payment accepts it, so then it is linked.
  // Otherwise linking finds or makes the agreed quote and the booking first. Either way one quote, one booking.
  const chosen =
    row.quoteId === null
      ? null
      : await tx.quote.findUniqueOrThrow({ where: { id: row.quoteId }, select: { status: true } });
  let bookingId: string | null = null;
  if (chosen === null || chosen.status === "accepted") bookingId = await link(row.quoteId);
  const quoteId = row.quoteId ?? (await quoteOfBooking(tx, bookingId));
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
  bookingId ??= await link(row.quoteId);
  // Moves the lead to won; a no-op (no second change or notice) when the payment already did.
  await advanceLeadStage(tx, access, { leadId: row.leadId, stage: "won" }, now);
  await tx.aiBooking.update({
    where: { id: row.id },
    data: {
      status: "confirmed",
      decidedBy: access.userId,
      decidedAt: now,
      bookingId,
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
