// What the AI answers when it reads what changed in a trip (the AI change assistant): each change cites the lines that
// say it, and prices and dates come back as printed. Read leniently; the domain builds every value from the cited lines.
import { z } from "zod";
import { MAX_QUOTE_DAYS } from "../quotes/quotes.js";
import { roomTypes } from "../quotes/room-prices.js";
import { tripFields } from "./package-changes.js";

const lines = z.array(z.string().max(20)).max(20).catch([]);
const printedPrices = z
  .array(z.object({ room: z.enum(roomTypes), printed: z.string().max(40).nullable() }))
  .max(roomTypes.length);
const ref = z.string().max(12);
const printedDate = z.string().max(40);

export const answeredPackageChange = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("season_add"),
    label: z.string().max(200).catch(""),
    from: printedDate,
    to: printedDate.nullable().catch(null),
    prices: printedPrices,
    lines,
  }),
  z.object({
    kind: z.literal("season_change"),
    season: ref,
    label: z.string().max(200).nullable().catch(null),
    prices: printedPrices,
    lines,
  }),
  z.object({
    kind: z.literal("departures_add"),
    dates: z.array(printedDate).max(62).catch([]),
    weekly: z
      .object({ days: z.array(z.string().max(20)).max(7), from: printedDate, to: printedDate })
      .nullable()
      .catch(null),
    lines,
  }),
  z.object({ kind: z.literal("departure_cancel"), departure: ref, reason: z.string().max(400).catch(""), lines }),
  z.object({ kind: z.literal("departure_reopen"), departure: ref, lines }),
  z.object({ kind: z.literal("departure_prices"), departure: ref, prices: printedPrices, lines }),
  z.object({
    kind: z.literal("departure_seats"),
    departure: ref,
    seats: z.union([z.int(), z.string().max(10)]),
    lines,
  }),
  z.object({ kind: z.literal("trip_field"), field: z.enum(tripFields), value: z.unknown(), lines }),
  z.object({ kind: z.literal("note_add"), line: z.string().max(600), lines }),
  z.object({ kind: z.literal("note_remove"), note: ref, lines }),
  z.object({
    kind: z.literal("itinerary"),
    days: z
      .array(z.object({ title: z.string().max(400), description: z.string().max(4000).catch("") }))
      .max(MAX_QUOTE_DAYS),
    lines,
  }),
  z.object({ kind: z.literal("ai_selling"), on: z.boolean(), lines }),
]);
export type AnsweredPackageChange = z.infer<typeof answeredPackageChange>;

/** The answer as a whole; its changes are read one by one with answeredPackageChange, so one bad change drops alone. */
export const packageChangesAnswer = z.object({
  changes: z.array(z.unknown()).max(80).catch([]),
  /** The lines of the photos the AI cites, as it read them ("P1.L3"). */
  photoLines: z
    .array(z.object({ ref: z.string().max(20), text: z.string().max(500) }))
    .max(200)
    .catch([]),
  questions: z
    .array(z.object({ text: z.string().max(300), choices: z.array(z.string().max(120)).max(6).catch([]) }))
    .max(5)
    .catch([]),
  ignored: z.array(z.string().max(300)).max(20).catch([]),
  notChanged: z.array(z.string().max(300)).max(20).catch([]),
  brochureLeftOut: z.boolean().catch(false),
});
