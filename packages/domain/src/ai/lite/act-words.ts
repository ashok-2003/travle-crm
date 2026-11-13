// The lite agent's words for the team, in English: why it handed a chat over, the note it leaves on the lead, and the
// follow-up it sets. They hold codes' sentences, package names and the customer's name, never the customer's words.
import type { HandOverReason } from "./types.js";

/** Why the AI stepped back, as the inbox bar, the owner's alert and the lead's note say it. */
export const handOverSentences: Record<HandOverReason, string> = {
  discount: "Asked for a discount or a better price.",
  custom_trip: "Wants a custom or private trip.",
  big_group: "A group of more than 10 people.",
  complaint: "Is unhappy or has a complaint.",
  wants_person: "Asked to talk to a person.",
  wants_call: "Asked for a call.",
  payment_problem: "Has a payment problem, or wants a refund or to cancel.",
  has_booking: "Already has a booking with you.",
  image: "Sent a photo or file that isn't a payment.",
  voice_note: "Sent a voice note, which the AI can't listen to yet.",
  unanswered: "Asked something your setup doesn't answer.",
  loop: "Didn't answer the same question three times.",
  other_twice: "Wrote twice in a way the AI couldn't place.",
  check_failed: "The AI couldn't write a safe reply.",
  details_changed: "Gave trip details that differ from what your team typed on the lead.",
};

/** What a quoted note names: the trip, its day, the party and the money told. */
export interface QuotedWords {
  package: string;
  date: string;
  travellers: string;
  total: string;
  advance: string;
}

export const noteWords = {
  packagePicked: (pkg: string) => `Interested in ${pkg}.`,
  quoted: (told: QuotedWords) =>
    `Price given for ${told.package}, ${told.date}, ${told.travellers}: total ${told.total}, advance ${told.advance}.`,
  handedOver: (reason: HandOverReason) => `Handed to the team: ${handOverSentences[reason]}`,
  notInterested: "Said they're not interested.",
  later: "Said they'll decide later.",
};

const HOUR_MS = 3_600_000;

/** The follow-up for the lead's owner: its title and how soon it is due. */
export const followUps = {
  call_back: { title: (name: string) => `Call ${name}: asked for a call`, dueInMs: HOUR_MS },
  decide_later: {
    title: (name: string) => `Follow up with ${name}: said they'll decide later`,
    dueInMs: 48 * HOUR_MS,
  },
};
