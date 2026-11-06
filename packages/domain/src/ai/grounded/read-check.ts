// Keeps of a model's read only what the customer's own words back: evidence must sit inside one customer message.
import type { ReadAnswer } from "@travel-crm/contracts/ai";
import type { ReadKeys } from "./read-keys.js";

/** Lowercase, single spaces, no punctuation (Unicode-aware, so Devanagari letters and marks stay). */
export function normalised(text: string): string {
  return text.toLowerCase().replace(/\p{P}/gu, " ").replace(/\s+/gu, " ").trim();
}

export function checkedRead(read: ReadAnswer, customerTexts: string[], keys: ReadKeys): ReadAnswer {
  const messages = customerTexts.map(normalised);
  const written = (evidence: string) => {
    const wanted = normalised(evidence);
    return wanted !== "" && messages.some((message) => message.includes(wanted));
  };
  const destinationKeys = new Set(keys.destinations.map((entry) => entry.key));
  const packageKeys = new Set(keys.packages.map((entry) => entry.key));

  const dated = read.startsOn !== null && written(read.startsOn.evidence) ? read.startsOn : null;
  const date = dated?.date != null && dated.date >= keys.today ? dated.date : null;
  const month = dated?.month != null && dated.month >= keys.today.slice(0, 7) ? dated.month : null;
  const wantsStands = written(read.wantsEvidence);

  return {
    places: read.places.filter(
      (place) => (place.destination === "none" || destinationKeys.has(place.destination)) && written(place.evidence),
    ),
    startsOn: dated && (date !== null || month !== null) ? { date, month, evidence: dated.evidence } : null,
    rooms: read.rooms.filter((room) => written(room.evidence)),
    travellers: read.travellers && written(read.travellers.evidence) ? read.travellers : null,
    budgetRupees: read.budgetRupees && written(read.budgetRupees.evidence) ? read.budgetRupees : null,
    pickupCity: read.pickupCity && written(read.pickupCity.evidence) ? read.pickupCity : null,
    chosen: read.chosen && packageKeys.has(read.chosen.package) && written(read.chosen.evidence) ? read.chosen : null,
    // A wish nobody wrote is "other", never "book" or "paid".
    wants: wantsStands ? read.wants : "other",
    wantsEvidence: wantsStands ? read.wantsEvidence : "",
    special: read.special && written(read.special.evidence) ? read.special : null,
    nearest: [...new Set(read.nearest.filter((key) => packageKeys.has(key)))].slice(0, 3),
  };
}
