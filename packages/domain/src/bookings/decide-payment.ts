// A person's decision on a payment to check (confirm or refuse a claim or an AI booking), then telling the customer: both in
// the caller's one transaction, so the facts the message needs (lead, chat, trip, amount) come off the record decided, read
// before the decision as the preview reads them, so what the person saw is what goes.
import type { ConfirmPaymentInput, PaymentTold, RefusePaymentInput } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { scopeFilter, type MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { confirmAiPayment, refuseAiPayment } from "./ai-payments.js";
import { confirmClaim, rejectClaim } from "./claims.js";
import { findBookingInScope } from "./rows.js";
import {
  previewPaymentTelling,
  tellPaymentOutcome,
  type PaymentOutcome,
  type PaymentTellingPreview,
} from "./payment-messages.js";

interface Facts {
  leadId: string;
  conversationId: string | null;
  /** The title of the quote a person made for it; null for none (a quote made from a chat holds the AI's words). */
  trip: string | null;
  /** What the customer said they paid (a claim's), or the advance code asked (an AI booking's); null when nobody knows. */
  claimedPaise: number | null;
  /** What a telling of this record is keyed on. */
  recordKey: string;
  /** An AI booking's newest proof: refusing after a new screenshot is a new telling, a repeat of one refusal is not. */
  latestProofId: string | null;
}

/** The record's facts, found through the member's lead scope first: a record they can't see answers as one that isn't there. */
async function factsOf(tx: OrgTx, access: MemberAccess, kind: "claim" | "ai_booking", id: string): Promise<Facts> {
  if (kind === "claim") {
    const claim = await tx.paymentClaim.findUnique({ where: { id }, select: { bookingId: true, amountPaise: true } });
    if (claim === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such payment claim");
    const booking = await findBookingInScope(tx, access, claim.bookingId);
    return {
      leadId: booking.leadId,
      conversationId: null,
      trip: booking.quotePlaceholder ? null : booking.quote.title,
      claimedPaise: Number(claim.amountPaise),
      recordKey: `claim:${id}`,
      latestProofId: null,
    };
  }
  const row = await tx.aiBooking.findFirst({
    where: { id, lead: scopeFilter(access, "bookings:view", "ownerUserId") },
    select: {
      leadId: true,
      conversationId: true,
      expectedPaise: true,
      proofMessageIds: true,
      quote: { select: { title: true, bookings: { where: { quotePlaceholder: true }, select: { id: true } } } },
    },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such booking");
  return {
    leadId: row.leadId,
    conversationId: row.conversationId,
    trip: row.quote === null || row.quote.bookings.length > 0 ? null : row.quote.title,
    // Only an amount code worked out; what the AI wrote down is a note for the person, never the customer's words.
    claimedPaise: row.expectedPaise === null ? null : Number(row.expectedPaise),
    recordKey: `ai_booking:${id}`,
    latestProofId: row.proofMessageIds.at(-1) ?? null,
  };
}

/** The telling of an outcome: the amount is the person's entry for a confirmation, the customer's claim for not found. */
function tellingOf(
  access: MemberAccess,
  facts: Facts,
  outcome: PaymentOutcome,
  amountPaise: number | null,
  agencyName: string | undefined,
) {
  const notFoundKey =
    facts.latestProofId === null ? facts.recordKey : `${facts.recordKey}:not-found:${facts.latestProofId}`;
  return {
    organizationId: access.organizationId,
    leadId: facts.leadId,
    conversationId: facts.conversationId,
    outcome,
    amountPaise,
    trip: facts.trip,
    recordKey: outcome === "not_found" ? notFoundKey : facts.recordKey,
    ...(agencyName === undefined ? {} : { agencyName }),
  };
}

/** How the customer would hear a confirmation (of the amount typed so far) or a not found, changing nothing. */
export async function paymentMessagePreview(
  tx: OrgTx,
  access: MemberAccess,
  input: {
    kind: "claim" | "ai_booking";
    id: string;
    outcome: "confirm" | "not_found";
    amountPaise?: number | undefined;
  },
  now: Date,
): Promise<PaymentTellingPreview> {
  const facts = await factsOf(tx, access, input.kind, input.id);
  const telling =
    input.outcome === "confirm"
      ? tellingOf(access, facts, "confirmed", input.amountPaise ?? null, undefined)
      : tellingOf(access, facts, "not_found", facts.claimedPaise, undefined);
  return previewPaymentTelling(tx, telling, now);
}

/** Confirms the money, then tells the customer it arrived. A repeat records and sends nothing more. */
export async function confirmPayment(
  tx: OrgTx,
  access: MemberAccess,
  input: ConfirmPaymentInput & { agencyName?: string },
  now: Date,
): Promise<PaymentTold> {
  const facts = await factsOf(tx, access, input.kind, input.id);
  if (input.kind === "claim")
    await confirmClaim(tx, access, { claimId: input.id, amountPaise: input.amountPaise }, now);
  else
    await confirmAiPayment(
      tx,
      access,
      { bookingId: input.id, amountPaise: input.amountPaise, reference: input.reference },
      now,
    );
  return tellPaymentOutcome(tx, tellingOf(access, facts, "confirmed", input.amountPaise, input.agencyName), now);
}

/** Refuses the payment (it wasn't found, or the amount was wrong), and tells the customer when the person chose to. */
export async function refusePayment(
  tx: OrgTx,
  access: MemberAccess,
  input: RefusePaymentInput & { agencyName?: string },
  now: Date,
): Promise<PaymentTold> {
  const facts = await factsOf(tx, access, input.kind, input.id);
  if (input.kind === "claim") await rejectClaim(tx, access, { claimId: input.id, reason: input.reason }, now);
  else await refuseAiPayment(tx, access, { bookingId: input.id, reason: input.reason }, now);
  if (!input.tell) return "none";
  return tellPaymentOutcome(tx, tellingOf(access, facts, "not_found", facts.claimedPaise, input.agencyName), now);
}
