// What a lite booking takes and what it says: the told quote's package, departure, rooms and party, refused in act's
// order when any is missing, and the hold and amount due in the customer's language. Act's book and the Try it dry run
// both take them from here, so what Try it shows is what the live turn would do and send. Pure: callers read the rest.
import type { RoomBooking } from "@travel-crm/contracts/quotes";
import { formatRupees, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import type { Quote } from "./decide/context.js";
import { fixedText, holdUntilWords, travellersWords } from "./fixed-texts.js";
import type { Part } from "./reply-parts.js";
import type { Decision, DepartureLine, Situation } from "./types.js";

export interface BookingParts {
  pkg: { id: string; title: string };
  departure: DepartureLine;
  rooms: RoomBooking[];
  travellers: number;
  told: Quote;
  /** What the customer is asked to pay now: the advance, or the total when they pay in full. */
  due: number;
}

export interface BookingRefusal {
  refused: "PAYMENT_DETAILS_MISSING" | "PACKAGE_NOT_SELLABLE" | "AI_ACTION_REFUSED";
  message: string;
}

/**
 * The booking the decision asks for, or the refusal act throws for it: no payment details first (without them the
 * package is not sellable either, and the owner must hear which to fix), then a package the AI may no longer sell, then
 * anything short of the quoted package, departure and party.
 */
export function bookingPartsOf(input: {
  decision: Decision;
  situation: Situation;
  target: { packageId: string; departureId: string };
  told: Quote | null;
  paymentReady: boolean;
  sellable: boolean;
}): BookingParts | BookingRefusal {
  const { decision, situation, target, told } = input;
  if (!input.paymentReady) {
    return { refused: "PAYMENT_DETAILS_MISSING", message: "The agency has no payment details to send" };
  }
  if (!input.sellable) {
    return { refused: "PACKAGE_NOT_SELLABLE", message: "The package is no longer one the AI may sell" };
  }
  const { package: pkg, price } = situation;
  const departure = price?.departure ?? null;
  if (
    told === null ||
    pkg?.id !== target.packageId ||
    price?.packageId !== target.packageId ||
    departure?.id !== target.departureId ||
    told.departureId !== target.departureId ||
    decision.facts.adults === null ||
    price.travellers === null ||
    price.rooms.length === 0
  ) {
    return { refused: "AI_ACTION_REFUSED", message: "A booking needs the quoted package, departure and party" };
  }
  return {
    pkg: { id: pkg.id, title: pkg.title },
    departure,
    rooms: price.rooms,
    travellers: price.travellers,
    told,
    due: decision.facts.payInFull ? told.totalPaise : told.advancePaise,
  };
}

/** The booking's message with the spans code filled in it: the party, the trip, the day, the hold's end, the amounts. */
export function bookingPart(
  parts: BookingParts,
  facts: Decision["facts"],
  hold: { holdUntil: Date; today: CalendarDate; timeZone: string },
): Part {
  const { language } = facts;
  const values = {
    travellers: travellersWords(facts.adults ?? parts.travellers, facts.children?.count ?? 0, language),
    package: parts.pkg.title,
    date: formatShortDay(parts.departure.startsOn, hold.today),
    holdUntil: holdUntilWords(hold.holdUntil, hold.today, hold.timeZone),
    total: formatRupees(parts.told.totalPaise),
  };
  return facts.payInFull
    ? fixedText("book_payment_full", language, values)
    : fixedText("book_payment", language, { ...values, advance: formatRupees(parts.told.advancePaise) });
}

/** The booking's message: the party, the trip and its day, until when the seats are held, the total and what is due. */
export function bookingWords(
  parts: BookingParts,
  facts: Decision["facts"],
  hold: { holdUntil: Date; today: CalendarDate; timeZone: string },
): string {
  return bookingPart(parts, facts, hold).text;
}
