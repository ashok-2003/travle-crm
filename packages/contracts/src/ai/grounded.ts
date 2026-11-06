// The facts the grounded WhatsApp turn keeps between a chat's turns, written by code and read back; never a model's words.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { roomBooking, roomType } from "../quotes/room-prices.js";

/** A stored room is read back, not entered: unlike `roomBooking` (an input) an extra key must not lose the whole row. */
const storedRoom = z.object({ roomType, people: roomBooking.shape.people });

/** Where the customer wants to go: the agency's destination when it runs one, else the customer's own words. */
const place = z.object({ destinationId: recordId.nullable().default(null), words: z.string().default("") });

/** What this chat has settled so far. Every field defaults, so `{}` (a new chat, or a row that cannot be read) parses. */
export const chatFacts = z.object({
  places: z.array(place).default([]),
  /** The customer's words for places the agency has no package for. */
  notRun: z.array(z.string()).default([]),
  startsOn: calendarDate.nullable().default(null),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullable()
    .default(null),
  rooms: z.array(storedRoom).default([]),
  travellers: z.int().nullable().default(null),
  budgetPaise: z.int().nullable().default(null),
  pickupCity: z.string().nullable().default(null),
  packageId: recordId.nullable().default(null),
  departureId: recordId.nullable().default(null),
  sentFileIds: z.array(recordId).default([]),
  /** The departure the payment details went out for. */
  paymentSentFor: recordId.nullable().default(null),
  bookingId: recordId.nullable().default(null),
});
export type ChatFacts = z.infer<typeof chatFacts>;
