// Code's own words of a reply: the price (with the seats left when few), and the moves that are fixed texts. The model
// writes none of these; the pieces are joined by a blank line, each keeping the spans the reply check must skip.
import type { LiteFacts, LiteLanguage } from "@travel-crm/contracts/ai";
import { formatRupees, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import type { Found } from "./phrase-match.js";
import { fixedText, roomWords, travellersWords } from "./fixed-texts.js";
import { FEW_SEATS } from "./write-move.js";
import type { Move, Situation } from "./types.js";

export interface Part {
  text: string;
  filled: Found[];
}

const PLACE_CHARACTERS = 40;

function priceTexts(
  move: Extract<Move, { kind: "give_price" }>,
  situation: Situation,
  facts: LiteFacts,
  language: LiteLanguage,
  today: CalendarDate,
): Part | null {
  const { package: pkg, price } = situation;
  if (pkg === null || price === null || pkg.id !== move.packageId) return null;
  const { departure, fromPaise, perPersonPaise, totalPaise, advancePaise, roomType, travellers } = price;
  const { adults } = facts;
  const complete =
    departure !== null &&
    perPersonPaise !== null &&
    totalPaise !== null &&
    advancePaise !== null &&
    roomType !== null &&
    adults !== null &&
    travellers !== null;
  if (move.price === "full" && complete) {
    const full = fixedText("price_full", language, {
      package: pkg.title,
      date: formatShortDay(departure.startsOn, today),
      perPerson: formatRupees(perPersonPaise),
      room: roomWords(roomType, language),
      travellers: travellersWords(adults, facts.children?.count ?? 0, language),
      total: formatRupees(totalPaise),
      advance: formatRupees(advancePaise),
    });
    if (departure.freeSeats > FEW_SEATS) return full;
    return composeReply([full, fixedText("seats_left", language, { seats: String(departure.freeSeats) })], " ");
  }
  // "from" is also the fallback for a total that cannot be told: it never reads as the chosen room's price.
  if (fromPaise === null) return null;
  return fixedText("price_from", language, { package: pkg.title, from: formatRupees(fromPaise) });
}

/** The move's code-written words, or null when the model (or nobody) writes the move. */
export function fixedPartOf(
  move: Move,
  situation: Situation,
  facts: LiteFacts,
  language: LiteLanguage,
  agencyName: string,
  today: CalendarDate,
): Part | null {
  if (move.kind === "give_price") return priceTexts(move, situation, facts, language, today);
  if (move.kind !== "fixed") return null;
  if (move.text === "identity") return fixedText("identity", language, { agency: agencyName });
  if (move.text === "not_run") {
    const place = facts.notRun.at(-1)?.trim().slice(0, PLACE_CHARACTERS) ?? "";
    // Decide adds the place to notRun in the same step; without it there is nothing true to say.
    if (place === "") throw new RangeError("not_run without a place in facts.notRun");
    return fixedText("not_run", language, { place });
  }
  return fixedText(move.text, language, {});
}

/** The parts joined (by a blank line unless told otherwise), with each part's spans shifted to the whole. */
export function composeReply(parts: (Part | null)[], separator = "\n\n"): Part {
  let text = "";
  const filled: Found[] = [];
  for (const part of parts) {
    if (part === null) continue;
    if (text !== "") text += separator;
    filled.push(...part.filled.map((span) => ({ start: span.start + text.length, end: span.end + text.length })));
    text += part.text;
  }
  return { text, filled };
}
