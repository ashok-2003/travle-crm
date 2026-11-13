// Keeps of a model's read only what the customer's own words back: evidence must sit inside one customer message and
// must itself hold the value it is given for (P4-26), a number its own value (read-numbers.ts).
import type { ReadAnswer } from "@travel-crm/contracts/ai";
import type { ChatLine, ReadKeys } from "./read-keys.js";
import { saysAmount, saysCount, saysDay, saysMonth, saysRoomCount } from "../lite/read-numbers.js";
import {
  asksToBook,
  containsWords,
  hasAWishCue,
  hasAWord,
  isAQuestion,
  isAffirmation,
  normalised,
  sentencesIn,
  sharesAWord,
} from "../lite/read-words.js";

export { normalised } from "../lite/read-words.js";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function checkedRead(read: ReadAnswer, transcript: ChatLine[], keys: ReadKeys): ReadAnswer {
  const messages = transcript.flatMap((line, index) =>
    line.from === "customer" ? [{ index, text: normalised(line.text) }] : [],
  );
  const found = (evidence: string) =>
    hasAWord(evidence) && messages.some((message) => containsWords(message.text, evidence));
  /** Found, and holding what `holds` asks of it. */
  const backed = (evidence: string, holds: (evidence: string) => boolean) => found(evidence) && holds(evidence);

  const destinationFor = (key: string) => keys.destinations.find((entry) => entry.key === key);
  const places = read.places.flatMap((place): ReadAnswer["places"] => {
    if (!backed(place.evidence, (evidence) => containsWords(evidence, place.words))) return [];
    if (place.destination === "none") return [place];
    const destination = destinationFor(place.destination);
    if (!destination) return [];
    const named =
      containsWords(place.evidence, destination.name) ||
      sharesAWord(place.evidence, destination.name, 4) ||
      sharesAWord(place.words, destination.name, 3);
    return [named ? place : { ...place, destination: "none" }];
  });

  const dated = read.startsOn && found(read.startsOn.evidence) ? read.startsOn : null;
  const date =
    dated?.date != null && dated.date >= keys.today && saysDay(dated.evidence, dated.date) ? dated.date : null;
  const month =
    dated?.month != null &&
    MONTH.test(dated.month) &&
    dated.month >= keys.today.slice(0, 7) &&
    saysMonth(dated.evidence, dated.month)
      ? dated.month
      : null;

  const chosenPackage = keys.packages.find((entry) => entry.key === read.chosen?.package);
  const chosen =
    read.chosen &&
    chosenPackage &&
    backed(
      read.chosen.evidence,
      (evidence) =>
        containsWords(evidence, chosenPackage.title) ||
        sharesAWord(evidence, `${chosenPackage.title} ${chosenPackage.destination}`, 4),
    )
      ? read.chosen
      : null;

  return {
    places,
    startsOn: dated && (date !== null || month !== null) ? { date, month, evidence: dated.evidence } : null,
    rooms: read.rooms.filter((room) => backed(room.evidence, (evidence) => saysRoomCount(evidence, room.count))),
    travellers:
      read.travellers &&
      backed(read.travellers.evidence, (evidence) => saysCount(evidence, read.travellers?.count ?? 0))
        ? read.travellers
        : null,
    budgetRupees:
      read.budgetRupees &&
      backed(read.budgetRupees.evidence, (evidence) => saysAmount(evidence, read.budgetRupees?.amount ?? -1))
        ? read.budgetRupees
        : null,
    pickupCity:
      read.pickupCity &&
      backed(read.pickupCity.evidence, (evidence) => containsWords(evidence, read.pickupCity?.words ?? ""))
        ? read.pickupCity
        : null,
    chosen,
    ...wish(read, transcript, found),
    special: read.special && found(read.special.evidence) ? read.special : null,
    nearest: [...new Set(read.nearest.filter((key) => keys.packages.some((entry) => entry.key === key)))].slice(0, 3),
  };
}

/** Whether the customer said the evidence as a statement somewhere: a sentence that holds it and asks nothing. */
function saidAsAStatement(evidence: string, transcript: ChatLine[]): boolean {
  if (isAQuestion(evidence)) return false;
  return transcript.some((line) => {
    if (line.from !== "customer" || !containsWords(line.text, evidence)) return false;
    const holding = sentencesIn(line.text).filter((sentence) => containsWords(sentence, evidence));
    // Evidence across two sentences is judged by the whole message.
    return holding.length === 0 ? !isAQuestion(line.text) : holding.some((sentence) => !isAQuestion(sentence));
  });
}

/**
 * A wish nobody wrote is "other". Book and paid must be said, never asked ("how do I book?", "final price?"), and need a
 * cue of their own, or a bare yes that answers the agency's question about booking.
 */
function wish(read: ReadAnswer, transcript: ChatLine[], found: (evidence: string) => boolean) {
  const other = { wants: "other" as const, wantsEvidence: "" };
  if (!found(read.wantsEvidence)) return other;
  if (read.wants !== "book" && read.wants !== "paid") return { wants: read.wants, wantsEvidence: read.wantsEvidence };
  if (!saidAsAStatement(read.wantsEvidence, transcript)) return other;
  if (hasAWishCue(read.wantsEvidence)) return { wants: read.wants, wantsEvidence: read.wantsEvidence };
  if (!isAffirmation(read.wantsEvidence)) return other;
  // The agency's line right before the customer line that says it must have asked about booking.
  const asked = transcript.some(
    (line, index) =>
      line.from === "customer" &&
      containsWords(line.text, read.wantsEvidence) &&
      transcript[index - 1]?.from === "agency" &&
      asksToBook(transcript[index - 1]?.text ?? ""),
  );
  return asked ? { wants: read.wants, wantsEvidence: read.wantsEvidence } : other;
}
