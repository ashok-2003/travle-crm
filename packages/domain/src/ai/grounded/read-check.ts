// Keeps of a model's read only what the customer's own words back: evidence must sit inside one customer message and
// must itself hold the value it is given for (P4-26).
import type { ReadAnswer } from "@travel-crm/contracts/ai";
import type { ChatLine, ReadKeys } from "./read-keys.js";
import {
  asksToBook,
  containsWords,
  hasAMonth,
  hasANumber,
  hasARoomCount,
  hasAWishCue,
  hasAWord,
  isAffirmation,
  normalised,
  sharesAWord,
} from "./read-words.js";

export { normalised } from "./read-words.js";

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
  const date = dated?.date != null && dated.date >= keys.today && hasANumber(dated.evidence) ? dated.date : null;
  const month =
    dated?.month != null &&
    MONTH.test(dated.month) &&
    dated.month >= keys.today.slice(0, 7) &&
    hasAMonth(dated.evidence)
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
    rooms: read.rooms.filter((room) => backed(room.evidence, hasARoomCount)),
    travellers: read.travellers && backed(read.travellers.evidence, hasANumber) ? read.travellers : null,
    budgetRupees: read.budgetRupees && backed(read.budgetRupees.evidence, hasANumber) ? read.budgetRupees : null,
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

/** A wish nobody wrote is "other". Book and paid need a cue of their own, or a bare yes that answers a question about booking. */
function wish(read: ReadAnswer, transcript: ChatLine[], found: (evidence: string) => boolean) {
  const other = { wants: "other" as const, wantsEvidence: "" };
  if (!found(read.wantsEvidence)) return other;
  if (read.wants !== "book" && read.wants !== "paid") return { wants: read.wants, wantsEvidence: read.wantsEvidence };
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
