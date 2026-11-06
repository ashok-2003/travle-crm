// A person's decision on a payment to check (confirm or refuse a claim or an AI booking), then telling the customer: both in
// the caller's one transaction, so the facts the message needs (lead, chat, trip, date, amount) come off the record decided.
import type { ConfirmPaymentInput, PaymentTold, RefusePaymentInput } from "@travel-crm/contracts/bookings";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, parseCalendarDate, type CalendarDate } from "../kernel/index.js";
import { confirmAiPayment, refuseAiPayment } from "./ai-payments.js";
import { confirmClaim, rejectClaim } from "./claims.js";
import { tellPaymentOutcome, type PaymentOutcome } from "./payment-messages.js";

interface Facts {
  leadId: string;
  conversationId: string | null;
  trip: string;
  date: CalendarDate | null;
}

async function factsOf(tx: OrgTx, kind: "claim" | "ai_booking", id: string): Promise<Facts> {
  if (kind === "claim") {
    const claim = await tx.paymentClaim.findUnique({
      where: { id },
      select: {
        booking: { select: { leadId: true, startDate: true, quote: { select: { title: true } } } },
      },
    });
    if (claim === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such payment claim");
    const { booking } = claim;
    return {
      leadId: booking.leadId,
      conversationId: null,
      trip: booking.quote.title,
      date: booking.startDate === null ? null : parseCalendarDate(booking.startDate.toISOString().slice(0, 10)),
    };
  }
  const row = await tx.aiBooking.findUnique({
    where: { id },
    select: { leadId: true, conversationId: true, summary: true },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such booking");
  return { leadId: row.leadId, conversationId: row.conversationId, trip: row.summary, date: null };
}

async function tell(
  tx: OrgTx,
  access: MemberAccess,
  facts: Facts,
  outcome: PaymentOutcome,
  input: { kind: string; id: string; amountPaise: number; agencyName?: string },
  now: Date,
): Promise<PaymentTold> {
  return tellPaymentOutcome(
    tx,
    {
      organizationId: access.organizationId,
      leadId: facts.leadId,
      conversationId: facts.conversationId,
      outcome,
      amountPaise: input.amountPaise,
      trip: facts.trip,
      date: facts.date,
      recordKey: `${input.kind}:${input.id}`,
      ...(input.agencyName === undefined ? {} : { agencyName: input.agencyName }),
    },
    now,
  );
}

/** Confirms the money, then tells the customer it arrived. A repeat records and sends nothing more. */
export async function confirmPayment(
  tx: OrgTx,
  access: MemberAccess,
  input: ConfirmPaymentInput & { agencyName?: string },
  now: Date,
): Promise<PaymentTold> {
  const facts = await factsOf(tx, input.kind, input.id);
  if (input.kind === "claim")
    await confirmClaim(tx, access, { claimId: input.id, amountPaise: input.amountPaise }, now);
  else
    await confirmAiPayment(
      tx,
      access,
      { bookingId: input.id, amountPaise: input.amountPaise, reference: input.reference },
      now,
    );
  return tell(tx, access, facts, "confirmed", input, now);
}

/** Refuses the payment (it wasn't found, or the amount was wrong), and tells the customer when the person chose to. */
export async function refusePayment(
  tx: OrgTx,
  access: MemberAccess,
  input: RefusePaymentInput & { agencyName?: string },
  now: Date,
): Promise<PaymentTold> {
  const facts = await factsOf(tx, input.kind, input.id);
  if (input.kind === "claim") await rejectClaim(tx, access, { claimId: input.id, reason: input.reason }, now);
  else await refuseAiPayment(tx, access, { bookingId: input.id, reason: input.reason }, now);
  if (!input.tell) return "none";
  const amountPaise = await claimedAmount(tx, input.kind, input.id);
  return tell(tx, access, facts, "not_found", { ...input, amountPaise }, now);
}

/** What the customer said they paid (a claim's amount, an AI booking's written amount), for the not-found message. */
async function claimedAmount(tx: OrgTx, kind: "claim" | "ai_booking", id: string): Promise<number> {
  if (kind === "claim") {
    const claim = await tx.paymentClaim.findUniqueOrThrow({ where: { id }, select: { amountPaise: true } });
    return Number(claim.amountPaise);
  }
  const row = await tx.aiBooking.findUniqueOrThrow({ where: { id }, select: { details: true, expectedPaise: true } });
  if (row.expectedPaise !== null) return Number(row.expectedPaise);
  const amount = ((row.details ?? {}) as Record<string, unknown>).amount;
  return paiseFromRupeesText(typeof amount === "string" ? amount : "") ?? 0;
}
