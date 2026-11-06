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
  travellers: z.int().min(1).nullable().default(null),
  budgetPaise: z.int().min(0).nullable().default(null),
  pickupCity: z.string().nullable().default(null),
  packageId: recordId.nullable().default(null),
  departureId: recordId.nullable().default(null),
  sentFileIds: z.array(recordId).default([]),
  /** The departure the payment details went out for. */
  paymentSentFor: recordId.nullable().default(null),
  bookingId: recordId.nullable().default(null),
});
export type ChatFacts = z.infer<typeof chatFacts>;

const words = z.string().max(120);
/** The customer's own words that a fact rests on; code keeps the fact only when they are in a message the customer wrote. */
const evidence = z.string().max(300);

/** What a model labels in a chat: only what the customer said, each with its evidence. Keys are D<n> for destinations and S<n> for packages. */
export const readAnswer = z.object({
  /** `destination` is a D-key, or "none" for a place the agency does not run. */
  places: z.array(z.object({ destination: z.string().max(20), words, evidence })).max(8),
  startsOn: z.object({ date: calendarDate.nullable(), month: z.string().max(7).nullable(), evidence }).nullable(),
  rooms: z.array(z.object({ type: roomType, count: z.int().min(1).max(6), evidence })).max(8),
  travellers: z.object({ count: z.int().min(1).max(40), evidence }).nullable(),
  budgetRupees: z.object({ amount: z.int().min(0).max(1_000_000_000), evidence }).nullable(),
  pickupCity: z.object({ words, evidence }).nullable(),
  chosen: z.object({ package: z.string().max(20), evidence }).nullable(),
  wants: z.enum(["information", "price", "brochure", "book", "paid", "person", "about_agency", "other"]),
  wantsEvidence: evidence,
  /** Any price the packages do not hold (owner decision 4). */
  special: z.object({ kind: z.enum(["discount", "b2b", "private", "group_rate", "other_price"]), evidence }).nullable(),
  /** S-keys of the agency's packages nearest to a place it does not run. */
  nearest: z.array(z.string().max(20)).max(3),
});
export type ReadAnswer = z.infer<typeof readAnswer>;

/** The same contract as JSON Schema, for the AI port's structured output (the domain package has no zod). */
export const readAnswerJsonSchema = z.toJSONSchema(readAnswer) as Record<string, unknown>;

/** What the writing model answers: the reply, with placeholders for every amount and date, and the actions it picks from those code allows. */
export const writeAnswer = z.object({
  reply: z.string().min(1).max(1000),
  actions: z.object({
    /** Card keys (`P1`...): code sends that package's brochures not sent yet. */
    sendFiles: z.array(z.string().max(20)).max(5),
    sendAgencyFiles: z.boolean(),
    sendPayment: z.boolean(),
    requestBooking: z.boolean(),
    /** A short reason for the team to look at this chat. */
    flag: z.string().max(200).nullable(),
    handOver: z.string().max(200).nullable(),
    note: z.string().max(500).nullable(),
    task: z.object({ title: z.string().min(1).max(200), dueInHours: z.int().min(1).max(168) }).nullable(),
  }),
});
export type WriteAnswer = z.infer<typeof writeAnswer>;

export const writeAnswerJsonSchema = z.toJSONSchema(writeAnswer) as Record<string, unknown>;
