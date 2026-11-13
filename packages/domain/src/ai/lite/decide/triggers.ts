// The hand-overs that win over every other move (spec D, N2): a voice note, a customer who has already booked, what
// only a person may answer, a detail that contradicts what a person typed on the lead, and a group too big for the agent.
import type { LiteFacts, LiteIntent } from "@travel-crm/contracts/ai";
import type { HandOverReason } from "../types.js";

/** In this order, which is also their rank when the customer's words carry two. */
const PERSON_INTENTS = [
  "payment_problem",
  "complaint",
  "wants_person",
  "wants_call",
  "discount",
  "custom_trip",
] as const satisfies readonly (LiteIntent & HandOverReason)[];
/** N2: above this many travellers a person takes the group. */
const BIGGEST_GROUP = 10;

export function handOverTrigger(input: {
  burstKinds: readonly string[];
  hasBooking: boolean;
  intents: readonly LiteIntent[];
  facts: LiteFacts;
  /** The customer's newest words contradict a trip field a person typed on the lead. */
  detailsChanged: boolean;
  /** A returning customer whose new lead could not be opened: nothing to quote or book on. */
  noOpenLead: boolean;
}): HandOverReason | null {
  // Plan 3 has no transcription: the words of a voice note are never read, whatever else came with it.
  if (input.burstKinds.includes("audio")) return "voice_note";
  if (input.hasBooking) return "has_booking";
  if (input.noOpenLead) return "no_open_lead";
  const intent = PERSON_INTENTS.find((one) => input.intents.includes(one));
  if (intent !== undefined) return intent;
  // A person typed it: a person reconciles it, before any price for what the customer now says.
  if (input.detailsChanged) return "details_changed";
  const travellers = (input.facts.adults ?? 0) + (input.facts.children?.count ?? 0);
  return travellers > BIGGEST_GROUP ? "big_group" : null;
}
