// The ticked changes put through the trip's own operations, each audited as a person's edit would be: price columns and
// seasons, the trip's fields with its notes and itinerary in one save, the departures, and the AI switch. Each step
// returns what it replaced, for Undo all.
import {
  tripFieldValueOf,
  type PackageChange,
  type PackageChangeRunBefore,
  type TripField,
} from "@travel-crm/contracts/ai";
import { MAX_PACKAGE_NOTES, type PackageSeasonView } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import {
  addPackageDates,
  cancelDeparture,
  reopenCancelledDeparture,
  setDeparturePrices,
  setDepartureSeats,
} from "../../departures/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError, type CalendarDate } from "../../kernel/index.js";
import {
  daysOf,
  mergePackagePart,
  saveSpecialPrices,
  savePackageSeason,
  setPackageSellable,
  updatePackage,
  type PackageRow,
} from "../../quotes/index.js";
import { refuse } from "../refusals.js";

type Of<Kind extends PackageChange["kind"]> = Extract<PackageChange, { kind: Kind }>;
const ofKind = <Kind extends PackageChange["kind"]>(changes: readonly PackageChange[], kind: Kind) =>
  changes.filter((change): change is Of<Kind> => change.kind === kind);

/** Price columns first (by their seasons' ids), then the seasons added, which may shorten or split those. */
export async function applySeasons(
  tx: OrgTx,
  access: MemberAccess,
  packageId: string,
  chosen: readonly PackageChange[],
  seasons: readonly PackageSeasonView[],
): Promise<void> {
  const byId = new Map(seasons.map((season) => [season.id, season]));
  for (const change of ofKind(chosen, "season_change")) {
    for (const seasonId of change.seasonIds) {
      const season = byId.get(seasonId);
      if (season === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
      const { startsOn, endsOn } = season;
      await savePackageSeason(tx, access, {
        packageId,
        seasonId,
        label: change.label,
        startsOn,
        endsOn,
        prices: change.prices,
      });
    }
  }
  for (const change of ofKind(chosen, "season_add")) {
    const { label, startsOn, endsOn, prices } = change;
    await saveSpecialPrices(tx, access, { packageId, label, startsOn, endsOn, prices });
  }
}

/** The notes with the removed lines gone and the added ones first; null when no note changes. */
function notesAfter(notes: string, chosen: readonly PackageChange[]): string | null {
  const removed = new Set(ofKind(chosen, "note_remove").map((change) => change.line));
  const lines = notes.split("\n");
  const added = ofKind(chosen, "note_add")
    .map((change) => change.line)
    .filter((line) => !lines.some((existing) => existing.trim() === line));
  if (removed.size === 0 && added.length === 0) return null;
  const after = [...added, ...lines.filter((line) => !removed.has(line.trim()))].join("\n");
  if (after.length > MAX_PACKAGE_NOTES) {
    throw refuse("PACKAGE_NOTES_TOO_LONG", "The trip's notes would be too long with these lines", "VALIDATION");
  }
  return after;
}

const scheduleFields: readonly TripField[] = ["weeklyDays", "departureMonths", "seatsPerDeparture"];

/** The trip's value of a field as a save takes it. */
const storedValue = (trip: PackageRow, field: TripField) =>
  field === "advancePerPersonPaise"
    ? trip.advancePerPersonPaise === null
      ? null
      : Number(trip.advancePerPersonPaise)
    : trip[field];

/** The fields, notes and itinerary in one save over the stored trip; whether a field departures are made from changed. */
export async function applyTripFields(
  tx: OrgTx,
  access: MemberAccess,
  trip: PackageRow,
  chosen: readonly PackageChange[],
): Promise<{ before: PackageChangeRunBefore["fields"]; scheduleChanged: boolean }> {
  const part: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  for (const change of ofKind(chosen, "trip_field")) {
    const typed = tripFieldValueOf(change);
    part[typed.field] = typed.value;
    before[typed.field] = storedValue(trip, typed.field);
  }
  const notes = notesAfter(trip.notes, chosen);
  if (notes !== null) {
    part.notes = notes;
    before.notes = trip.notes;
  }
  const itinerary = ofKind(chosen, "itinerary").at(-1);
  if (itinerary !== undefined) {
    part.days = itinerary.days;
    before.days = daysOf(trip);
  }
  if (Object.keys(part).length === 0) return { before: {}, scheduleChanged: false };
  await updatePackage(tx, access, mergePackagePart(trip, { packageId: trip.id, ...part }));
  return { before, scheduleChanged: scheduleFields.some((field) => field in part) };
}

/** Departures reopened, given seats or prices of their own, cancelled, then the new days added. */
export async function applyDepartures(
  tx: OrgTx,
  access: MemberAccess,
  packageId: string,
  chosen: readonly PackageChange[],
  context: { today: CalendarDate; now: Date },
): Promise<void> {
  for (const change of ofKind(chosen, "departure_reopen")) {
    await reopenCancelledDeparture(tx, access, change.departureId, context.today);
  }
  for (const change of ofKind(chosen, "departure_seats")) {
    await setDepartureSeats(
      tx,
      access,
      { departureId: change.departureId, seatsTotal: change.seatsTotal },
      context.now,
    );
  }
  for (const change of ofKind(chosen, "departure_prices")) {
    await setDeparturePrices(tx, access, { departureId: change.departureId, prices: change.prices });
  }
  for (const change of ofKind(chosen, "departure_cancel")) {
    await cancelDeparture(tx, access, { departureId: change.departureId, reason: change.reason }, context.now);
  }
  for (const change of ofKind(chosen, "departures_add")) {
    for (const day of change.dates) {
      await addPackageDates(tx, access, { packageId, from: day, to: day, weekdays: [] }, context.today);
    }
  }
}

/** The AI switch, last: turning it on needs nothing missing, which the changes before may have filled. */
export async function applySelling(
  tx: OrgTx,
  access: MemberAccess,
  trip: PackageRow,
  chosen: readonly PackageChange[],
  today: CalendarDate,
): Promise<boolean | null> {
  const selling = ofKind(chosen, "ai_selling").at(-1);
  if (selling === undefined) return null;
  await setPackageSellable(tx, access, { packageId: trip.id, sellable: selling.on }, today);
  return trip.aiSellable;
}
