// A trip as the AI change assistant reads it: its seasons as price columns, its departures ahead, the repeats, seats,
// advance, notes and details, as numbered text for the model (S1, D1, N1 name what a change touches) and as data. The
// stamp is a hash of the data a change could touch, so Apply and Undo all can tell whether the trip changed since.
import { createHash } from "node:crypto";
import type { DepartureStatus } from "@travel-crm/contracts/departures";
import {
  seasonColumns,
  type PackageKind,
  type PackageSeasonView,
  type QuoteDay,
  type RoomPrices,
  type RoomType,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { packageCalendar } from "../../departures/index.js";
import { addDays, formatRupees, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import { daysOf, findPackage, seasonsOf } from "../../quotes/index.js";

/** How far ahead the AI sees departures: 26 weeks. */
export const SNAPSHOT_DAYS = 182;
/** The most days one calendar read spans. */
const CALENDAR_STEP = 45;
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface SnapshotTrip {
  id: string;
  name: string;
  kind: PackageKind;
  nights: number | null;
  roomTypes: RoomType[];
  seatsPerDeparture: number | null;
  advancePerPersonPaise: number | null;
  weeklyDays: number[];
  departureMonths: number[];
  pickupPoints: string;
  startCity: string;
  inclusions: string;
  exclusions: string;
  cancellationNotes: string;
  notes: string;
  days: QuoteDay[];
  aiSellable: boolean;
}

export interface SnapshotDeparture {
  id: string;
  startDate: string;
  status: DepartureStatus;
  seatsTotal: number;
  seatsSold: number;
  seatsHeld: number;
  /** What applies on its first day, its own or its season's. */
  prices: RoomPrices;
  ownPrices: RoomPrices;
}

export interface SnapshotInput {
  /** The first day of the departures read: the day the run was proposed, so a later look reads the same window. */
  from: CalendarDate;
  trip: SnapshotTrip;
  seasons: PackageSeasonView[];
  departures: SnapshotDeparture[];
}

export interface TripSnapshot extends SnapshotInput {
  columns: (SeasonColumn & { ref: string })[];
  departures: (SnapshotDeparture & { ref: string })[];
  notes: { ref: string; line: string }[];
  /** The trip as the model reads it. */
  text: string;
}

/** "Fri 18 Dec 2026". */
const dayText = (day: string) => `${formatShortDay(day as CalendarDate, day as CalendarDate)} ${day.slice(0, 4)}`;
const pricesText = (prices: RoomPrices, sold: readonly RoomType[]) =>
  sold.map((type) => `${type} ${prices[type] === null ? "not sold" : formatRupees(prices[type])}`).join(", ");
const block = (label: string, text: string) =>
  text.trim() === ""
    ? `${label}: (none)`
    : `${label}:\n${text
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`;
const noteLines = (notes: string) =>
  notes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

function textOf(snapshot: Omit<TripSnapshot, "text">): string {
  const { trip } = snapshot;
  const sold = trip.roomTypes;
  const seasons = snapshot.columns.map((column) => {
    const when = column.open
      ? "all other days"
      : column.ranges.map((range) => `${dayText(range.startsOn)} to ${dayText(range.endsOn)}`).join("; ");
    return `${column.ref} ${column.label}, ${when}: ${pricesText(column.prices, sold)}`;
  });
  const departures = snapshot.departures.map((one) => {
    if (one.status === "cancelled") return `${one.ref} ${dayText(one.startDate)}: cancelled`;
    const own = Object.values(one.ownPrices).some((price) => price !== null);
    return (
      `${one.ref} ${dayText(one.startDate)}: ${one.status}, ${String(one.seatsTotal)} seats, ` +
      `${String(one.seatsSold)} sold, ${String(one.seatsHeld)} held; ${pricesText(one.prices, sold)}` +
      (own ? " (its own prices)" : "")
    );
  });
  const repeats =
    trip.weeklyDays.length === 0
      ? "none"
      : `every ${trip.weeklyDays.map((day) => weekdayNames[day] ?? "").join(", ")}, ` +
        (trip.departureMonths.length === 0
          ? "every month"
          : `in ${trip.departureMonths.map((month) => monthNames[month - 1] ?? "").join(", ")}`) +
        " (new departures are made 12 weeks ahead)";
  return [
    `Trip: ${trip.name} (${trip.kind} trip${trip.nights === null ? "" : `, ${String(trip.nights)} nights`})`,
    `Room types sold: ${sold.length === 0 ? "none" : sold.join(", ")}`,
    "Prices per person, one column per season:",
    ...(seasons.length === 0 ? ["(none)"] : seasons),
    `Departures from ${dayText(snapshot.from)}, 26 weeks:`,
    ...(departures.length === 0 ? ["(none)"] : departures),
    `Repeats: ${repeats}`,
    `Seats for each new departure: ${trip.seatsPerDeparture === null ? "not set" : String(trip.seatsPerDeparture)}`,
    `Advance to hold a seat: ${trip.advancePerPersonPaise === null ? "not set" : `${formatRupees(trip.advancePerPersonPaise)} per person`}`,
    `Where it starts: ${trip.startCity === "" ? "(none)" : trip.startCity}`,
    block("Pickup points", trip.pickupPoints),
    block("Inclusions", trip.inclusions),
    block("Exclusions", trip.exclusions),
    block("Cancellation notes", trip.cancellationNotes),
    "Notes:",
    ...(snapshot.notes.length === 0 ? ["(none)"] : snapshot.notes.map((note) => `${note.ref} ${note.line}`)),
    "Itinerary:",
    ...(trip.days.length === 0
      ? ["(none)"]
      : trip.days.map(
          (day, index) =>
            `Day ${String(index + 1)}: ${day.title}${day.description.trim() === "" ? "" : ` | ${day.description.replace(/\s+/g, " ")}`}`,
        )),
    `AI selling it: ${trip.aiSellable ? "on" : "off"}`,
  ].join("\n");
}

/** The snapshot from what was read: columns, refs and text worked out. */
export function buildSnapshot(input: SnapshotInput): TripSnapshot {
  const built = {
    ...input,
    columns: seasonColumns(input.seasons).map((column, index) => ({ ...column, ref: `S${String(index + 1)}` })),
    departures: input.departures.map((one, index) => ({ ...one, ref: `D${String(index + 1)}` })),
    notes: noteLines(input.trip.notes).map((line, index) => ({ ref: `N${String(index + 1)}`, line })),
  };
  return { ...built, text: textOf(built) };
}

/** The trip as it is now, its departures read from `from` for 26 weeks. */
export async function tripSnapshot(tx: OrgTx, packageId: string, from: CalendarDate, now: Date): Promise<TripSnapshot> {
  const row = await findPackage(tx, packageId);
  const seasons = await seasonsOf(tx, row.id);
  const departures: SnapshotDeparture[] = [];
  if (row.kind === "group") {
    const last = addDays(from, SNAPSHOT_DAYS);
    for (let start = from; start <= last; start = addDays(start, CALENDAR_STEP + 1)) {
      const end = addDays(start, CALENDAR_STEP);
      const read = await packageCalendar(tx, { packageId: row.id, from: start, to: end < last ? end : last }, now);
      departures.push(
        ...read.map((one) => ({
          id: one.departureId,
          startDate: one.startDate,
          status: one.status,
          seatsTotal: one.seatsTotal,
          seatsSold: one.seatsSold,
          seatsHeld: one.seatsHeld,
          prices: one.prices,
          ownPrices: one.ownPrices,
        })),
      );
    }
  }
  return buildSnapshot({
    from,
    trip: {
      id: row.id,
      name: row.name,
      kind: row.kind as PackageKind,
      nights: row.nights,
      roomTypes: row.roomTypes as RoomType[],
      seatsPerDeparture: row.seatsPerDeparture,
      advancePerPersonPaise: row.advancePerPersonPaise === null ? null : Number(row.advancePerPersonPaise),
      weeklyDays: row.weeklyDays,
      departureMonths: row.departureMonths,
      pickupPoints: row.pickupPoints,
      startCity: row.startCity,
      inclusions: row.inclusions,
      exclusions: row.exclusions,
      cancellationNotes: row.cancellationNotes,
      notes: row.notes,
      days: daysOf(row),
      aiSellable: row.aiSellable,
    },
    seasons,
    departures,
  });
}

/** JSON with every object's keys in order, so the same data always hashes the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The trip's state hash: its fields, seasons, and departures (day, status, seats, own prices). Seats sold and held are
 * left out, so a booking taken since is not a change to the trip.
 */
export function tripStamp(snapshot: SnapshotInput): string {
  const data = {
    from: snapshot.from,
    trip: snapshot.trip,
    seasons: snapshot.seasons.map((season) => ({
      id: season.id,
      label: season.label,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      prices: season.prices,
    })),
    departures: snapshot.departures.map((one) => ({
      id: one.id,
      startDate: one.startDate,
      status: one.status,
      seatsTotal: one.seatsTotal,
      ownPrices: one.ownPrices,
    })),
  };
  return createHash("sha256").update(canonical(data)).digest("hex");
}
