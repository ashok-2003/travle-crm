// AI part 3 (release ai3): rooming requests read from the notes on a departure's travellers, and the people worth asking about
// its empty seats with a personal message for each. The AI proposes and writes; staff tick, edit and send, one by one.
import { z } from "zod";
import { roomRequest } from "../departures/rooming.js";
import { recordId } from "../identity/fields.js";

export const readRoomRequestsInput = z.strictObject({ departureId: recordId });
export type ReadRoomRequestsInput = z.infer<typeof readRoomRequestsInput>;

/** One traveller whose notes the AI read as a request for their room. Unknown stays "none" and is not listed. */
export const roomRequestSuggestion = z.object({
  travellerId: recordId,
  name: z.string(),
  bookingNumber: z.string(),
  current: roomRequest,
  proposed: roomRequest,
  /** The words it was read from (up to 200 characters), so the person can check. */
  excerpt: z.string(),
});
export type RoomRequestSuggestion = z.infer<typeof roomRequestSuggestion>;

export const roomRequestsProposal = z.object({
  /** The fill the Apply is audited with; null when the AI found nothing to propose (the call is given back). */
  fillId: recordId.nullable(),
  suggestions: z.array(roomRequestSuggestion),
  usedThisMonth: z.int(),
  monthlyLimit: z.int(),
});
export type RoomRequestsProposal = z.infer<typeof roomRequestsProposal>;

/** At most this many people are shown, and staff tick at most this many to write messages for. */
export const INTERESTED_PEOPLE_SHOWN = 50;
export const OFFER_MESSAGES_MAX = 20;
/** A lead offered this departure is left alone for this many days. */
export const OFFER_PAUSE_DAYS = 14;

export const findInterestedInput = z.strictObject({ departureId: recordId });

export const interestedPerson = z.object({
  leadId: recordId,
  name: z.string(),
  /** E.164, for the WhatsApp link staff open. */
  phone: z.string(),
  /** What they asked about earlier: the place, when, and how many. */
  destination: z.string().nullable(),
  travelling: z.string().nullable(),
  partySize: z.int().nullable(),
  /** The day the lead was made (a calendar day in the agency's zone). */
  enquiredOn: z.string(),
  label: z.enum(["hot", "warm", "cold"]).nullable(),
});
export type InterestedPerson = z.infer<typeof interestedPerson>;

export const interestedPeople = z.object({
  people: z.array(interestedPerson),
  /** More people qualify than are shown. */
  more: z.boolean(),
});
export type InterestedPeople = z.infer<typeof interestedPeople>;

export const writeSeatMessageInput = z.strictObject({ departureId: recordId, leadId: recordId });
export type WriteSeatMessageInput = z.infer<typeof writeSeatMessageInput>;

export const seatMessage = z.object({
  fillId: recordId,
  /** The message, with `{price}` filled by code and any amount or seat count the agency doesn't allow taken out. */
  text: z.string(),
  usedThisMonth: z.int(),
  monthlyLimit: z.int(),
});
export type SeatMessage = z.infer<typeof seatMessage>;

/** "Sent": staff opened the message in their own WhatsApp. The words are only hashed, to tell whether staff changed them. */
export const markOfferSentInput = z.strictObject({
  departureId: recordId,
  leadId: recordId,
  fillId: recordId,
  text: z.string().min(1).max(3000),
});
export type MarkOfferSentInput = z.infer<typeof markOfferSentInput>;
