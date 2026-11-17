// The natural WhatsApp agent's contracts: what a chat keeps between turns (offer, totals told, what was sent), the
// booking terms, and the codes for a hand-over, a task and a follow-up's time.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { roomType } from "../quotes/room-prices.js";

/** Why a chat goes to a person (spec 3.5); a code, never the customer's words. */
export const naturalHandOverReasons = [
  "discount",
  "custom_trip",
  "complaint",
  "payment_check",
  "wants_person",
  "abuse",
  "big_group",
  "existing_booking",
] as const;
export type NaturalHandOverReason = (typeof naturalHandOverReasons)[number];
export const naturalTaskKinds = ["question", "call_back"] as const;
export type NaturalTaskKind = (typeof naturalTaskKinds)[number];
/** When the next follow-up goes; code places the exact time (G7). */
export const followUpWhens = [
  "in_a_few_hours",
  "this_evening",
  "tomorrow_morning",
  "tomorrow_evening",
  "on_date",
  "none",
] as const;
export type FollowUpWhen = (typeof followUpWhens)[number];

/** A booking as the customer would see it: which trip and day, who travels, the room, and whether they pay in full. */
export const bookingTerms = z.object({
  packageId: recordId,
  startsOn: calendarDate,
  adults: z.int().min(1).max(50),
  childrenAges: z.array(z.int().min(0).max(17)).max(20),
  room: roomType.nullable(),
  payInFull: z.boolean(),
});
export type BookingTerms = z.infer<typeof bookingTerms>;

/** The offer our latest message made (spec 3.4): its terms, departure and money, and when it was made. */
export const liveOffer = bookingTerms.extend({
  /** The one agent's offer card names it in its buttons; absent on natural's and on offers stored before. */
  id: recordId.optional(),
  departureId: recordId,
  totalPaise: z.int().min(0),
  advancePaise: z.int().min(0),
  at: z.iso.datetime(),
});
export type LiveOffer = z.infer<typeof liveOffer>;

/** A total the chat told the customer, for `book`'s told shortcut; pay-in-full doesn't change a total. */
export const toldTotal = bookingTerms
  .omit({ payInFull: true })
  .extend({ totalPaise: z.int().min(0), at: z.iso.datetime() });
export type ToldTotal = z.infer<typeof toldTotal>;

/** What a natural chat keeps in `ai_chat.facts`; `agent` is required, so a lite row never reads as a natural one. */
export const naturalFacts = z.object({
  agent: z.literal("natural"),
  leadId: recordId.nullable().default(null),
  sentTripIds: z.array(recordId).max(50).default([]),
  sentFileIds: z.array(recordId).max(150).default([]),
  offer: liveOffer.nullable().default(null),
  /** Newest last; those older than 30 days are dropped when the facts are written. */
  told: z.array(toldTotal).max(20).default([]),
  bookingId: recordId.nullable().default(null),
  lastTurnAt: z.iso.datetime().nullable().default(null),
});
export type NaturalFacts = z.infer<typeof naturalFacts>;
