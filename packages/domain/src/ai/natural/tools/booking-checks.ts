// The checks a booking passes (spec 3.4, G2): what makes an offer possible, and what makes `book` the customer's yes to
// it (ruling 1). The model judges the yes; code checks what it can see: the terms are the live offer's or a total told
// for exactly them, the customer's own words are in a new line, the name is one they gave, and the total still holds.
import type { BookingTerms, LiveOffer, NaturalFacts, ToldTotal } from "@travel-crm/contracts/ai";
import { formatRupees, type CalendarDate } from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { containsWords, normalised } from "../../lite/read-words.js";
import type { NaturalChatLine, NaturalLeadView, QuoteFigures, TripSheet } from "../types.js";
import type { Refused } from "./quote.js";
import { sameTerms, termsWords, toldMatches } from "./terms.js";

/** A bigger group is the team's (N2). */
const MOST_PEOPLE = 10;
/** A total told this recently books on a yes without an offer first. */
const TOLD_FOR_MS = 24 * 3_600_000;

/** What the booking checks read: the turn's trips and clock, the chat, the lead, the booking, and the quote. */
export interface BookingContext {
  sheets: readonly TripSheet[];
  today: CalendarDate;
  now: Date;
  facts: NaturalFacts;
  lead: NaturalLeadView;
  /** The whole chat read, oldest first. */
  lines: readonly NaturalChatLine[];
  /** The customer's lines this turn answers. */
  newLines: readonly NaturalChatLine[];
  paymentReady: boolean;
  /** A booking still ahead of the customer; `id` is the chat's own AI booking's. */
  booking: { id: string | null; awaitingPayment: boolean } | null;
  profileName: string | null;
  /** `quoteFor` on the turn's data: `terms.room` comes back as the room the quote used. */
  quoteOf: (terms: BookingTerms) => Promise<QuoteFigures | Refused>;
}

const refused = (why: string): Refused => ({ refused: `refused: ${why}` });

/** Whether the chat's own AI booking waits for its payment, the one `resend_payment` sends again. */
export const awaitsPayment = (booking: BookingContext["booking"]): boolean =>
  booking?.awaitingPayment === true && booking.id !== null;

/**
 * The offer's checks: 10 people or fewer, payment details set, no booking ahead or awaiting payment, then the quote's
 * own (sellable, a departure open with seats for the party, the room priced). A big group goes to a person whatever
 * the seats, so it is checked first.
 */
export async function offerChecks(context: BookingContext, terms: BookingTerms): Promise<QuoteFigures | Refused> {
  const people = terms.adults + terms.childrenAges.length;
  if (people > MOST_PEOPLE) {
    return refused(`${String(people)} people is more than 10; hand_over(big_group) with the group's details`);
  }
  if (!context.paymentReady) {
    return refused(
      "the agency's payment details aren't set, so this chat can't take a booking; create_task(question) for the " +
        "team with the booking's details",
    );
  }
  if (awaitsPayment(context.booking)) {
    return refused("their booking is waiting for payment; resend_payment sends the payment message again");
  }
  if (context.booking !== null) {
    return refused("they have a booking ahead; changing it or a second one is the team's: hand_over(existing_booking)");
  }
  return context.quoteOf(terms);
}

/**
 * The offer, while it is live: made in the last turn that ran, and nobody but the customer has written since our
 * message that made it (a team line or an automatic one may have changed what they are answering).
 */
function liveOfferOf({ facts, lines }: BookingContext): LiveOffer | null {
  const { offer, lastTurnAt } = facts;
  if (offer === null || lastTurnAt === null || Date.parse(offer.at) < Date.parse(lastTurnAt)) return null;
  return lines.findLast((line) => line.from !== "customer")?.from === "you" ? offer : null;
}

/** The newest total told for exactly these terms in the last 24 hours. */
function toldFor({ facts, now }: BookingContext, terms: BookingTerms): ToldTotal | null {
  const since = now.getTime() - TOLD_FOR_MS;
  return facts.told.findLast((told) => Date.parse(told.at) >= since && toldMatches(terms, told)) ?? null;
}

/** Whether the name is one the customer gave: in a line of theirs, or the lead's or their WhatsApp profile's name. */
function nameKnown({ lines, lead, profileName }: BookingContext, fullName: string): boolean {
  const name = normalised(fullName);
  if (name === "") return false;
  return (
    lines.some((line) => line.from === "customer" && containsWords(line.text, fullName)) ||
    [lead.name, profileName ?? ""].some((known) => normalised(known) === name)
  );
}

/**
 * `book`'s checks, in order: the offer's again; then ruling 1 (the quote's own terms equal the live offer's or a total
 * told, the customer's words are in a new line, the name is known); then the total is still the one they were shown.
 */
export async function bookChecks(
  context: BookingContext,
  terms: BookingTerms,
  said: { fullName: string; customerWords: string },
): Promise<{ figures: QuoteFigures; via: "offer" | "told" } | Refused> {
  const figures = await offerChecks(context, terms);
  if ("refused" in figures) return figures;
  const offer = liveOfferOf(context);
  const onOffer = offer !== null && sameTerms(figures.terms, offer) ? offer : null;
  const agreed = onOffer ?? toldFor(context, figures.terms);
  if (agreed === null) {
    return offer === null
      ? refused(
          "there is no live offer or total told for these terms; make the offer first with offer_booking, and book " +
            "after their yes",
        )
      : refused(
          `these terms differ from the live offer (${termsWords(offer, context.sheets, context.today)}, total ` +
            `${formatRupees(offer.totalPaise)}); book on its terms, or make a new offer first`,
        );
  }
  if (!context.newLines.some((line) => containsWords(line.text, said.customerWords))) {
    return refused(
      "customer_words must be their own words, copied from a message they sent after the offer; if they haven't " +
        "said yes, ask",
    );
  }
  if (!nameKnown(context, said.fullName)) {
    return refused(
      `"${fenced(said.fullName)}" isn't in the chat, on the lead or on their WhatsApp profile; ask for their full ` +
        "name as on their ID",
    );
  }
  if (figures.totalPaise !== agreed.totalPaise) {
    return refused(
      `the price changed since the ${onOffer === null ? "total was told" : "offer"}: the total is now ` +
        `${formatRupees(figures.totalPaise)}; make the offer again with offer_booking`,
    );
  }
  return { figures, via: onOffer === null ? "told" : "offer" };
}
