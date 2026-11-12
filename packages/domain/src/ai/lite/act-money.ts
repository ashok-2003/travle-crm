// The lite turn's money moves: a booking (the quote at the total told, the seats held, the AI booking) and the payment
// details sent again. The total and the amount due are the one quote the facts recorded and the booking holds, never
// worked out again; where to pay is the agency's own details, read now. Any refusal throws: nothing is held or sent.
import type { OrgTx } from "@travel-crm/db";
import { DomainError, formatRupees, formatShortDay } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, type AgencyPaymentDetails } from "../../profile/index.js";
import { sellablePackages } from "../../quotes/index.js";
import { takeAgentBooking } from "../agent-booking.js";
import type { LiteActDeps, LiteActInput } from "./act-types.js";
import { fixedText, holdUntilWords, travellersWords } from "./fixed-texts.js";
import type { Decision, Move } from "./types.js";

export interface MoneyMove {
  /** The booking this turn took; null when the payment details only go again. */
  bookingId: string | null;
  /** The reply: the hold and the amount due, or the amount again, in the customer's language. */
  text: string;
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

async function book(
  tx: OrgTx,
  deps: LiteActDeps,
  input: MoneyInput,
  move: Extract<Move, { kind: "book" }>,
  leadId: string | null,
): Promise<MoneyMove> {
  const { organizationId, today, language } = input;
  if (leadId === null) throw refuse("A booking needs an open lead");
  // Payment first: without it the package is no longer sellable either, and the owner must hear which to fix.
  const payment = await paymentDetails(tx, organizationId);
  const sellable = await sellablePackages(tx, organizationId, today);
  if (!sellable.some((one) => one.id === move.packageId && one.kind === "group")) {
    throw new DomainError("CONFLICT", "PACKAGE_NOT_SELLABLE", "The package is no longer one the AI may sell");
  }
  const { facts } = input.decision;
  const told = facts.quoted;
  const { package: pkg, price } = input.situation;
  const departure = price?.departure ?? null;
  if (
    told === null ||
    pkg?.id !== move.packageId ||
    price?.packageId !== move.packageId ||
    departure?.id !== move.departureId ||
    told.departureId !== move.departureId ||
    facts.adults === null ||
    price.travellers === null ||
    price.rooms.length === 0
  ) {
    throw refuse("A booking needs the quoted package, departure and party");
  }
  const due = facts.payInFull ? told.totalPaise : told.advancePaise;
  const booked = await takeAgentBooking(tx, deps, {
    organizationId,
    conversationId: input.conversationId,
    token: input.token,
    leadId,
    pkg: { id: pkg.id, title: pkg.title },
    departure: { id: departure.id, startsOn: departure.startsOn },
    rooms: price.rooms,
    travellers: price.travellers,
    toldTotalPaise: told.totalPaise,
    expectedPaise: BigInt(due),
    today,
    now: input.now,
  });
  // The message says until when the seats are held: with no live hold there is nothing true to say.
  if (booked.holdExpiresAt === null) {
    throw new DomainError("CONFLICT", "HOLD_EXISTS", "The lead's seats on this departure are not held");
  }
  const values = {
    travellers: travellersWords(facts.adults, facts.children?.count ?? 0, language),
    package: pkg.title,
    date: formatShortDay(departure.startsOn, today),
    holdUntil: holdUntilWords(booked.holdExpiresAt, today, input.timeZone),
    total: formatRupees(told.totalPaise),
  };
  const text = facts.payInFull
    ? fixedText("book_payment_full", language, values).text
    : fixedText("book_payment", language, { ...values, advance: formatRupees(told.advancePaise) }).text;
  return { bookingId: booked.bookingId, text, payment };
}

/** The chat's booking still waiting for its payment: the amount it asks and its quote's total, as booked. */
async function payAgain(tx: OrgTx, input: MoneyInput): Promise<MoneyMove> {
  const payment = await paymentDetails(tx, input.organizationId);
  const open = await tx.aiBooking.findFirst({
    where: { conversationId: input.conversationId, status: "awaiting_payment" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { expectedPaise: true, quote: { select: { totalPaise: true } } },
  });
  if (open?.expectedPaise == null || open.quote === null) throw refuse("No booking is waiting for its payment");
  const text = fixedText("payment_again", input.language, {
    amount: formatRupees(Number(open.expectedPaise)),
    total: formatRupees(Number(open.quote.totalPaise)),
  }).text;
  return { bookingId: null, text, payment };
}

/** A booking or the payment details again; null for every other move. */
export async function moneyMove(
  tx: OrgTx,
  deps: LiteActDeps,
  input: MoneyInput,
  leadId: string | null,
): Promise<MoneyMove | null> {
  const { move } = input.decision;
  if (move.kind === "book") return book(tx, deps, input, move, leadId);
  if (move.kind === "resend_payment") return payAgain(tx, input);
  return null;
}
