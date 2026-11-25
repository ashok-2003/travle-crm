// Grounding the changes to the trip itself: a season added or a price column changed, a field (seats, advance, repeats,
// pickup points, inclusions...), a note line added or removed, the itinerary, and the AI selling it. Prices, dates and
// every number a new text adds must be printed in a cited line; a date's year is the line's, else code's; taking
// something away (a room, the months, a text) needs a cited line that says so.
import type { TripField } from "@travel-crm/contracts/ai";
import { noRoomPrices, packageFields, type QuoteDay } from "@travel-crm/contracts/quotes";
import { amountInLine, parsePrintedPrice } from "../rates/price.js";
import type { AnsweredOf } from "./answer.js";
import { groundedDay, monthsIn, startLooksBack, weekdaysIn } from "./dates.js";
import {
  flagged,
  hasPrice,
  labelOf,
  numberInTexts,
  numbersBacked,
  pricesFrom,
  samePrices,
  type Built,
  type ChangeFlag,
  type Grounding,
} from "./ground-values.js";
import type { SnapshotTrip } from "./trip-snapshot.js";

export type TripChange = AnsweredOf<
  "season_add" | "season_change" | "trip_field" | "note_add" | "note_remove" | "itinerary" | "ai_selling"
>;

function seasonAdd(change: AnsweredOf<"season_add">, grounding: Grounding): Built | null {
  const { texts, today, snapshot } = grounding;
  const start = groundedDay(change.from, texts, startLooksBack(today));
  if (start === null) return null;
  const startsOn = start.day;
  const flags = new Set<ChangeFlag>(flagged(start.inLines));
  // No end: until changed. An end that isn't one date reads as none, flagged.
  let endsOn = null;
  if (change.to !== null && change.to.trim() !== "") {
    const end = groundedDay(change.to, texts, startsOn);
    endsOn = end?.day ?? null;
    if (end?.inLines !== true) flags.add("not_in_message");
  }
  const { prices, grounded } = pricesFrom(change.prices, noRoomPrices, snapshot.trip.roomTypes, texts);
  if (!hasPrice(prices)) return null;
  if (!grounded) flags.add("not_in_message");
  if (startsOn < today) flags.add("past_date");
  const label = labelOf(change.label);
  return {
    body: { kind: "season_add", label: label === "" ? "New prices" : label, startsOn, endsOn, prices },
    flags: [...flags],
  };
}

function seasonChange(change: AnsweredOf<"season_change">, grounding: Grounding): Built | null {
  const { snapshot, texts } = grounding;
  const column = snapshot.columns.find((one) => one.ref === change.season);
  if (column === undefined) return null;
  const { prices, grounded } = pricesFrom(change.prices, column.prices, snapshot.trip.roomTypes, texts);
  const label = labelOf(change.label ?? "") || column.label;
  if (!hasPrice(prices) || (samePrices(prices, column.prices) && label === column.label)) return null;
  return {
    body: {
      kind: "season_change",
      seasonIds: column.seasonIds,
      label,
      before: { label: column.label, prices: column.prices },
      prices,
    },
    flags: flagged(grounded),
  };
}

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === null ? [] : [value]);
const sortedUnique = (values: readonly number[]) => [...new Set(values)].sort((first, second) => first - second);
const namedIn = (texts: readonly string[], read: (text: string) => Set<number>) =>
  new Set(texts.flatMap((text) => [...read(text)]));
/** "every month", "all months", "har mahine", "all year": departures in every month. */
const EVERY_MONTH =
  /\b(?:every|all|har|sab(?:hi)?)\s+(?:months?|mahin[ea]?)\b|\ball\s+year\b|\byear[\s-]round\b|\bsaal\s+bhar\b/i;

/** A field's new value from what the AI wrote, and whether the cited lines back it. */
function fieldValue(field: TripField, raw: unknown, before: unknown, texts: readonly string[]) {
  switch (field) {
    case "seatsPerDeparture": {
      const seats = typeof raw === "number" ? raw : Number(String(raw).replace(/\D/g, "") || "x");
      return { value: seats, grounded: numberInTexts(seats, texts) };
    }
    case "advancePerPersonPaise": {
      const paise = parsePrintedPrice(String(raw));
      return { value: paise, grounded: paise !== null && texts.some((text) => amountInLine(paise, text)) };
    }
    case "weeklyDays": {
      const days = sortedUnique(
        listOf(raw).flatMap((one) => (typeof one === "number" ? [one] : [...weekdaysIn(String(one))])),
      );
      const named = namedIn(texts, weekdaysIn);
      // Stopping the repeats needs a line naming a day it stops.
      const grounded =
        days.length === 0 ? (before as number[]).some((day) => named.has(day)) : days.every((day) => named.has(day));
      return { value: days, grounded };
    }
    case "departureMonths": {
      const months = sortedUnique(
        listOf(raw).flatMap((one) => (typeof one === "number" ? [one] : [...monthsIn(String(one))])),
      );
      const named = namedIn(texts, monthsIn);
      const grounded =
        months.length === 0 ? texts.some((text) => EVERY_MONTH.test(text)) : months.every((month) => named.has(month));
      return { value: months, grounded };
    }
    default: {
      const text = typeof raw === "string" ? raw.trim() : "";
      // A text emptied has nothing a line could print: always flagged.
      return { value: text, grounded: text !== "" && numbersBacked(text, String(before), texts) };
    }
  }
}

const groupOnlyFields: readonly TripField[] = ["seatsPerDeparture", "weeklyDays", "departureMonths"];

function tripField(change: AnsweredOf<"trip_field">, grounding: Grounding): Built | null {
  const { trip } = grounding.snapshot;
  if (trip.kind !== "group" && groupOnlyFields.includes(change.field)) return null;
  const before = trip[change.field as keyof SnapshotTrip];
  const found = fieldValue(change.field, change.value, before, grounding.texts);
  const parsed = packageFields[change.field].safeParse(found.value);
  if (!parsed.success || JSON.stringify(parsed.data) === JSON.stringify(before)) return null;
  return {
    body: { kind: "trip_field", field: change.field, before, value: parsed.data },
    flags: flagged(found.grounded),
  };
}

const daysText = (days: readonly QuoteDay[]) => days.map((day) => `${day.title}\n${day.description}`).join("\n");

function itinerary(change: AnsweredOf<"itinerary">, grounding: Grounding): Built | null {
  const before = grounding.snapshot.trip.days;
  const days = change.days.map((day, index) => ({
    title: day.title.trim().slice(0, 120).trim() || `Day ${String(index + 1)}`,
    description: day.description.trim().slice(0, 2000),
  }));
  // A trip with no days is never what a message means.
  if (days.length === 0 || JSON.stringify(days) === JSON.stringify(before)) return null;
  return {
    body: { kind: "itinerary", before, days },
    flags: flagged(numbersBacked(daysText(days), daysText(before), grounding.texts)),
  };
}

export function groundTrip(change: TripChange, grounding: Grounding): Built | null {
  const { snapshot, texts } = grounding;
  switch (change.kind) {
    case "season_add":
      return seasonAdd(change, grounding);
    case "season_change":
      return seasonChange(change, grounding);
    case "trip_field":
      return tripField(change, grounding);
    case "itinerary":
      return itinerary(change, grounding);
    case "note_add": {
      const line = change.line.trim().slice(0, 500).trim();
      if (line === "" || snapshot.notes.some((note) => note.line === line)) return null;
      return { body: { kind: "note_add", line }, flags: flagged(numbersBacked(line, "", texts)) };
    }
    case "note_remove": {
      const note = snapshot.notes.find((one) => one.ref === change.note);
      return note === undefined ? null : { body: { kind: "note_remove", line: note.line }, flags: [] };
    }
    case "ai_selling":
      return change.on === snapshot.trip.aiSellable ? null : { body: { kind: "ai_selling", on: change.on }, flags: [] };
  }
}
