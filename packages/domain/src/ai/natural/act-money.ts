// The natural turn's money (spec 3.4): `book` holds the party's seats and takes the AI booking at the total the customer
// was offered or told, asking the advance (or the total, paying in full); `resend_payment` sends the payment details
// again, a lapsed hold taken again first at the total the chat told. Where to pay is the agency's own details, read now.
// A refusal (seats gone, a changed price, a hold already there) undoes the step's writes and comes back as its reason.
import type { BookingTerms } from "@travel-crm/contracts/ai";
import { roomTypes } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { addAiLeadNote, renameWhatsAppPerson } from "../../crm/index.js";
import { calendarDateIn, DomainError, parseCalendarDate, systemActor } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, type AgencyPaymentDetails } from "../../profile/index.js";
import { sellablePackage } from "../../quotes/index.js";
import { takeAgentBooking } from "../agent-booking.js";
import type { ChatPerson } from "../lite/act-lead.js";
import { payAgainBooking, type LapsedBooking } from "../lite/act-money.js";
import { usableName } from "../lite/decide/stage.js";
import { liteRooms } from "../lite/lookups/package-reads.js";
import { normalised } from "../lite/read-words.js";
import { stagedOf, type NaturalActDeps, type NaturalActInput } from "./act-types.js";

export interface NaturalMoney {
  /** The booking this turn took; null when the payment details only go again, its seats still held. */
  bookingId: string | null;
  /** Where to pay, sent after the words. */
  payment: AgencyPaymentDetails;
  /** The customer now goes by the full name they booked under. */
  named: boolean;
}

export interface MoneyRefused {
  refused: string;
  message: string;
}

/** What a booking takes: its terms (the room the quote used), the departure, the total told and the amount due now. */
interface Deal {
  terms: Omit<BookingTerms, "payInFull">;
  departureId: string;
  totalPaise: number;
  expectedPaise: number;
  /** The full name they booked under: `book`'s, none for a lapsed hold taken again. */
  fullName: string | null;
}

/** Whom the turn books for: the open lead, and the chat's person. */
interface Booker {
  leadId: string | null;
  person: ChatPerson;
}

const refuse = (message: string) => new DomainError("CONFLICT", "AI_ACTION_REFUSED", message);

/**
 * Keeps the full name they booked under (spec case 8): over a WhatsApp stand-in or profile name, before the booking's
 * notice names them; beside a name a person typed, as a note. Inside the savepoint, so a refused booking keeps neither.
 */
async function keepBookedName(
  tx: OrgTx,
  input: NaturalActInput,
  leadId: string,
  person: ChatPerson,
  fullName: string,
): Promise<boolean> {
  const name = fullName.trim();
  if (person.personId === null || !usableName(name, person.phoneE164)) return false;
  const actor = systemActor(input.organizationId);
  const { personId, profileName, phoneE164 } = person;
  if (await renameWhatsAppPerson(tx, actor, { personId, leadId, name, profileName, phoneE164 })) return true;
  const kept = await tx.person.findUnique({ where: { id: personId }, select: { name: true } });
  if (kept !== null && normalised(kept.name) !== normalised(name)) {
    await addAiLeadNote(tx, actor, leadId, `Booked under the name ${name}.`);
  }
  return false;
}

/** Holds the party's seats and takes the booking at the total told, in this turn's booking. */
async function bookDeal(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  { leadId, person }: Booker,
  deal: Deal,
): Promise<NaturalMoney> {
  const { organizationId, today, now } = input;
  const { terms } = deal;
  if (leadId === null) throw refuse("A booking needs an open lead");
  const payment = await agencyPaymentDetailsOf(tx, organizationId);
  if (!paymentDetailsReady(payment)) {
    throw new DomainError("CONFLICT", "PAYMENT_DETAILS_MISSING", "The agency has no payment details to send");
  }
  // The owner may have taken the trip off sale since the turn read it.
  if ((await sellablePackage(tx, organizationId, terms.packageId, today))?.kind !== "group") {
    throw new DomainError("CONFLICT", "PACKAGE_NOT_SELLABLE", "The trip is not on sale now");
  }
  const pkg = await tx.quoteTemplate.findUniqueOrThrow({
    where: { id: terms.packageId },
    select: { id: true, title: true, roomTypes: true },
  });
  // The rooms the quote priced the party in, so the booking's quote comes to the same total.
  const offered = roomTypes.filter((type) => pkg.roomTypes.includes(type));
  const count = terms.childrenAges.length;
  const children = count === 0 ? null : { count, ages: [...terms.childrenAges] };
  const named = deal.fullName !== null && (await keepBookedName(tx, input, leadId, person, deal.fullName));
  const booked = await takeAgentBooking(tx, deps, {
    organizationId,
    conversationId: input.conversationId,
    token: input.token,
    leadId,
    pkg: { id: pkg.id, title: pkg.title },
    departure: { id: deal.departureId, startsOn: parseCalendarDate(terms.startsOn) },
    rooms: liteRooms({ adults: terms.adults, children, roomType: terms.room }, offered),
    travellers: terms.adults + count,
    toldTotalPaise: deal.totalPaise,
    expectedPaise: BigInt(deal.expectedPaise),
    today,
    now,
  });
  // The words say the seats are held: with no live hold of the party's seats that would not be true.
  if (booked.holdExpiresAt === null) {
    throw new DomainError("CONFLICT", "HOLD_EXISTS", "The lead's seats on this departure are not held");
  }
  return { bookingId: booked.bookingId, payment, named };
}

/**
 * A lapsed booking taken again (review M7): its quote keeps no rooms, so the terms are the ones the chat told or
 * offered for its trip, day, party and total, the newest first; none still matching refuses, and the turn answers again.
 */
async function rebook(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  booker: Booker,
  lapsed: LapsedBooking,
): Promise<NaturalMoney> {
  const departure = await tx.departure.findUnique({ where: { id: lapsed.departureId }, select: { startDate: true } });
  const startsOn = departure === null ? null : calendarDateIn(departure.startDate, "UTC");
  const party = lapsed.adults + lapsed.children;
  const { offer, told } = input.facts;
  const terms = [...told, ...(offer === null ? [] : [offer])].findLast(
    (one) =>
      one.packageId === lapsed.packageId &&
      one.startsOn === startsOn &&
      one.adults + one.childrenAges.length === party &&
      one.totalPaise === lapsed.totalPaise,
  );
  if (terms === undefined) throw refuse("The chat no longer holds the terms of the booking whose hold lapsed");
  const { totalPaise, expectedPaise, departureId } = lapsed;
  return bookDeal(tx, deps, input, booker, { terms, departureId, totalPaise, expectedPaise, fullName: null });
}

/**
 * Runs a money step at a savepoint: a refusal undoes what it wrote (a quote made before the total was found changed, a
 * lapsed booking cancelled before its seats were found gone) and comes back as its reason; anything else throws as it
 * is. The act writes nothing before its money, so after a refusal the turn has kept nothing.
 */
async function undoneOnRefusal(tx: OrgTx, step: () => Promise<NaturalMoney>): Promise<NaturalMoney | MoneyRefused> {
  await tx.$executeRaw`SAVEPOINT natural_money`;
  try {
    const money = await step();
    await tx.$executeRaw`RELEASE SAVEPOINT natural_money`;
    return money;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT natural_money`;
    return { refused: error.reason, message: error.message };
  }
}

/** The turn's booking or its payment details again; null when it staged neither. */
export async function moneyOfTurn(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
  booker: Booker,
): Promise<NaturalMoney | MoneyRefused | null> {
  const book = stagedOf(input.staged, "book");
  if (book !== null) {
    const { terms, departureId, totalPaise, advancePaise } = book.figures;
    const deal = { terms, departureId, totalPaise, fullName: book.fullName };
    const expectedPaise = terms.payInFull ? totalPaise : advancePaise;
    return undoneOnRefusal(tx, () => bookDeal(tx, deps, input, booker, { ...deal, expectedPaise }));
  }
  if (stagedOf(input.staged, "resend_payment") === null) return null;
  return undoneOnRefusal(tx, async () => {
    const again = await payAgainBooking(tx, input, (lapsed) => rebook(tx, deps, input, booker, lapsed));
    return "named" in again ? again : { bookingId: again.bookingId, payment: again.payment, named: false };
  });
}
