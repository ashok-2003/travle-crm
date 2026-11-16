// The lite turn's money moves: a booking (the quote at the total told, the seats held, the AI booking) and the payment
// details sent again. The total and the amount due are the one quote the facts recorded and the booking holds, never
// worked out again; where to pay is the agency's own details, read now. Payment is asked only for seats held now: a
// lapsed hold is taken again as a booking takes it. Any refusal throws: nothing is held, booked or sent.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { DomainError, formatRupees, systemActor } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, type AgencyPaymentDetails } from "../../profile/index.js";
import { sellablePackage } from "../../quotes/index.js";
import { takeAgentBooking } from "../agent-booking.js";
import type { LiteActDeps, LiteActInput } from "./act-types.js";
import { bookingPartsOf, bookingPart, type BookingRefusal } from "./booking-words.js";
import { fixedText } from "./fixed-texts.js";
import type { Quote } from "./decide/context.js";
import type { Found } from "./phrase-match.js";
import type { Decision } from "./types.js";

export interface MoneyMove {
  /** The booking this turn took; null when the payment details only go again. */
  bookingId: string | null;
  /** The reply: the hold and the amount due, or the amount again, in the customer's language. */
  text: string;
  /** The spans of `text` that code filled in. */
  filled: Found[];
  /** Where to pay, sent after the reply: the agency's QR and its lines. */
  payment: AgencyPaymentDetails;
}

type MoneyInput = LiteActInput & { decision: Decision };

const refuse = (message: string) => new DomainError("CONFLICT", "AI_ACTION_REFUSED", message);

/** Somewhere to pay, read now: the owner may have cleared it since the price was told. */
async function paymentDetails(tx: OrgTx, organizationId: string): Promise<AgencyPaymentDetails> {
  const details = await agencyPaymentDetailsOf(tx, organizationId);
  if (!paymentDetailsReady(details)) {
    throw new DomainError("CONFLICT", "PAYMENT_DETAILS_MISSING", "The agency has no payment details to send");
  }
  return details;
}

/** A booking's refusal as act throws it, each reason written out so the web's list of reasons can read it. */
function thrown(refusal: BookingRefusal): DomainError {
  switch (refusal.refused) {
    case "PAYMENT_DETAILS_MISSING":
      return new DomainError("CONFLICT", "PAYMENT_DETAILS_MISSING", refusal.message);
    case "PACKAGE_NOT_SELLABLE":
      return new DomainError("CONFLICT", "PACKAGE_NOT_SELLABLE", refusal.message);
    case "AI_ACTION_REFUSED":
      return new DomainError("CONFLICT", "AI_ACTION_REFUSED", refusal.message);
  }
}

/** Holds the party's seats and takes the booking at the total `told`, then words the hold and the amount due. */
async function book(
  tx: OrgTx,
  deps: LiteActDeps,
  input: MoneyInput,
  target: { packageId: string; departureId: string },
  leadId: string | null,
  told: Quote | null,
): Promise<MoneyMove> {
  const { organizationId, today } = input;
  if (leadId === null) throw refuse("A booking needs an open lead");
  const payment = await agencyPaymentDetailsOf(tx, organizationId);
  const paymentReady = paymentDetailsReady(payment);
  // Only the package it books: the whole list costs a read per package.
  const sellable =
    paymentReady && (await sellablePackage(tx, organizationId, target.packageId, today))?.kind === "group";
  const parts = bookingPartsOf({
    decision: input.decision,
    situation: input.situation,
    target,
    told,
    paymentReady,
    sellable,
  });
  if ("refused" in parts) throw thrown(parts);
  const booked = await takeAgentBooking(tx, deps, {
    organizationId,
    conversationId: input.conversationId,
    token: input.token,
    leadId,
    pkg: parts.pkg,
    departure: { id: parts.departure.id, startsOn: parts.departure.startsOn },
    rooms: parts.rooms,
    travellers: parts.travellers,
    toldTotalPaise: parts.told.totalPaise,
    expectedPaise: BigInt(parts.due),
    today,
    now: input.now,
  });
  // The message says until when the seats are held: with no live hold of the party's seats there is nothing true to say.
  if (booked.holdExpiresAt === null) {
    throw new DomainError("CONFLICT", "HOLD_EXISTS", "The lead's seats on this departure are not held");
  }
  const words = bookingPart(parts, input.decision.facts, {
    holdUntil: booked.holdExpiresAt,
    today,
    timeZone: input.timeZone,
  });
  return { bookingId: booked.bookingId, ...words, payment };
}

/**
 * The chat's booking still waiting for its payment: the amount it asks and its quote's total, as booked, while the
 * lead's hold of the party's seats is live. Once it has lapsed the seats are taken again at the total that booking was
 * told, in a booking of this turn's, and the old one is cancelled; seats gone or a changed total throw, as a booking does.
 */
async function payAgain(tx: OrgTx, deps: LiteActDeps, input: MoneyInput, leadId: string | null): Promise<MoneyMove> {
  const { conversationId, now } = input;
  const open = await tx.aiBooking.findFirst({
    where: { conversationId, status: "awaiting_payment" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      leadId: true,
      expectedPaise: true,
      quote: { select: { totalPaise: true, templateId: true, departureId: true, adults: true, children: true } },
    },
  });
  const quote = open?.quote ?? null;
  if (open?.expectedPaise == null || quote?.templateId == null || quote.departureId == null) {
    throw refuse("No booking is waiting for its payment");
  }
  // The party the booking's own quote holds seats for: the facts may say fewer now, and a hold that short is no hold.
  const party = Math.max(1, quote.adults + quote.children);
  const held = await tx.departureHold.findFirst({
    where: {
      leadId: open.leadId,
      departureId: quote.departureId,
      seats: { gte: party },
      status: "active",
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (held === null) {
    // One booking waits for payment at a time: the lapsed one goes. If the new one is refused, this rolls back with it.
    const actor = systemActor(input.organizationId);
    await tx.aiBooking.update({ where: { id: open.id }, data: { status: "cancelled", decidedAt: now } });
    await recordAudit(tx, actor, {
      action: "ai.booking-decided",
      entityType: "ai_booking",
      entityId: open.id,
      after: { status: "cancelled" },
    });
    const told = {
      departureId: quote.departureId,
      totalPaise: Number(quote.totalPaise),
      advancePaise: Number(open.expectedPaise),
    };
    return book(tx, deps, input, { packageId: quote.templateId, departureId: quote.departureId }, leadId, told);
  }
  const payment = await paymentDetails(tx, input.organizationId);
  const words = fixedText("payment_again", input.language, {
    amount: formatRupees(Number(open.expectedPaise)),
    total: formatRupees(Number(quote.totalPaise)),
  });
  return { bookingId: null, ...words, payment };
}

/** A booking or the payment details again; null for every other move. */
export async function moneyMove(
  tx: OrgTx,
  deps: LiteActDeps,
  input: MoneyInput,
  leadId: string | null,
): Promise<MoneyMove | null> {
  const { move } = input.decision;
  if (move.kind === "book") return book(tx, deps, input, move, leadId, input.decision.facts.quoted);
  if (move.kind === "resend_payment") return payAgain(tx, deps, input, leadId);
  return null;
}
