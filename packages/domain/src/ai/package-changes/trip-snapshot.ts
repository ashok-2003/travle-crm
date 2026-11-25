// A trip as the AI change assistant reads it: its seasons as price columns, its departures ahead, the repeats, seats,
// advance, notes and details, as numbered text for the model (S1, D1, N1 name what a change touches) and as data. The
// stamp is a hash of the data a change could touch, so Apply and Undo all can tell whether the trip changed since.
import { createHash } from "node:crypto";
import { seasonColumns, type PackageKind, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { packageCalendar } from "../../departures/index.js";
import { addDays, type CalendarDate } from "../../kernel/index.js";
import { daysOf, findPackage, seasonsOf } from "../../quotes/index.js";
import { textOf } from "./snapshot-text.js";
import type { SnapshotDeparture, SnapshotInput, SnapshotTrip, TripSnapshot } from "./snapshot-types.js";

export type { SnapshotDeparture, SnapshotInput, SnapshotTrip, TripSnapshot } from "./snapshot-types.js";

/** How far ahead the AI sees departures: 26 weeks. */
export const SNAPSHOT_DAYS = 182;
/** The most days one calendar read spans. */
const CALENDAR_STEP = 45;

const noteLines = (notes: string) =>
  notes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

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
    const read = [];
    for (let start = from; start <= last; start = addDays(start, CALENDAR_STEP + 1)) {
      const end = addDays(start, CALENDAR_STEP);
      read.push(...(await packageCalendar(tx, { packageId: row.id, from: start, to: end < last ? end : last }, now)));
    }
    const scheduled = await tx.departure.findMany({
      where: { id: { in: read.map((one) => one.departureId) } },
      select: { id: true, scheduledOn: true },
    });
    const scheduledOn = new Map(scheduled.map((one) => [one.id, one.scheduledOn?.toISOString().slice(0, 10) ?? null]));
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
        scheduledOn: scheduledOn.get(one.departureId) ?? null,
      })),
    );
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
 * A departure the schedule made that nobody changed since: on its day, open, with no prices of its own and the seats new
 * departures get. The nightly job makes these on its own, so they are no change to the trip.
 */
const untouchedScheduled = (one: SnapshotDeparture, trip: SnapshotTrip) =>
  one.scheduledOn === one.startDate &&
  one.status === "open" &&
  Object.values(one.ownPrices).every((price) => price === null) &&
  one.seatsTotal === trip.seatsPerDeparture;

/**
 * The trip's state hash: its fields, seasons, and departures (day, status, seats, own prices). Seats sold and held are
 * left out, so a booking taken since is not a change to the trip; so are departures the schedule made that nobody
 * changed, so the nightly job making the next one is not either.
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
    departures: snapshot.departures
      .filter((one) => !untouchedScheduled(one, snapshot.trip))
      .map((one) => ({
        id: one.id,
        startDate: one.startDate,
        status: one.status,
        seatsTotal: one.seatsTotal,
        ownPrices: one.ownPrices,
      })),
  };
  return createHash("sha256").update(canonical(data)).digest("hex");
}
