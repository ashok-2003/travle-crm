// A trip in the typed columns a lead and a repeat enquiry share (R8): the form's trip with its destination resolved,
// written as columns, and read back as the pages show it. The budget is BigInt paise in the table and Money at the
// edge; travel dates are calendar days, a month its first day.
import {
  budgetBasis,
  foodPreference,
  hotelCategory,
  tripType,
  type Budget,
  type TravelWhen,
  type TripDetail,
  type TripInput,
  type TripSummary,
} from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { destinationById, findOrAddDestination } from "../catalog/index.js";
import { DomainError, type Actor } from "../kernel/index.js";

/** A trip as the form gives it, its destination resolved to one of the agency's (or none). */
export type TripRecord = Omit<TripInput, "destination"> & { destinationId: string | null };

/** The trip columns every read of a lead or enquiry selects. */
export const tripColumnNames = {
  destinationId: true,
  travelKind: true,
  travelStart: true,
  travelEnd: true,
  travelMonth: true,
  adults: true,
  childrenAges: true,
  budgetPaise: true,
  budgetBasis: true,
  departureCity: true,
  tripType: true,
  hotelCategory: true,
  food: true,
  roomType: true,
} as const;

export interface TripColumns {
  destinationId: string | null;
  travelKind: string;
  travelStart: Date | null;
  travelEnd: Date | null;
  travelMonth: Date | null;
  adults: number | null;
  childrenAges: number[];
  budgetPaise: bigint | null;
  budgetBasis: string | null;
  departureCity: string | null;
  tripType: string | null;
  hotelCategory: string | null;
  food: string | null;
  roomType: string | null;
}

/** The destination the form chose, or the one a new name means: found whatever its case, else added (R2, R34). */
export async function resolveTrip(tx: OrgTx, actor: Actor, trip: TripInput): Promise<TripRecord> {
  const { destination, ...rest } = trip;
  if (destination === null) return { ...rest, destinationId: null };
  if (destination.kind === "new") {
    return { ...rest, destinationId: (await findOrAddDestination(tx, actor, destination.name)).id };
  }
  const found = await destinationById(tx, destination.destinationId);
  if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such destination");
  return { ...rest, destinationId: found.id };
}

const day = (text: string) => new Date(`${text}T00:00:00Z`);
const dayText = (date: Date) => date.toISOString().slice(0, 10);

export function tripColumns(trip: TripRecord): TripColumns {
  const { when, budget } = trip;
  return {
    destinationId: trip.destinationId,
    travelKind: when.kind,
    travelStart: when.kind === "dates" ? day(when.from) : null,
    travelEnd: when.kind === "dates" ? day(when.to) : null,
    travelMonth: when.kind === "month" ? day(`${when.month}-01`) : null,
    adults: trip.adults,
    childrenAges: [...trip.childrenAges],
    budgetPaise: budget === null ? null : BigInt(budget.amount.amountPaise),
    budgetBasis: budget?.basis ?? null,
    departureCity: trip.departureCity,
    tripType: trip.tripType,
    hotelCategory: trip.hotelCategory,
    food: trip.food,
    roomType: trip.roomType,
  };
}

export function travelWhenOf(row: Pick<TripColumns, "travelKind" | "travelStart" | "travelEnd" | "travelMonth">) {
  const { travelKind, travelStart, travelEnd, travelMonth } = row;
  let when: TravelWhen = { kind: "unknown" };
  if (travelKind === "dates" && travelStart !== null && travelEnd !== null) {
    when = { kind: "dates", from: dayText(travelStart), to: dayText(travelEnd) };
  } else if (travelKind === "month" && travelMonth !== null) {
    when = { kind: "month", month: dayText(travelMonth).slice(0, 7) };
  } else if (travelKind === "flexible") {
    when = { kind: "flexible" };
  }
  return when;
}

export function budgetOf(row: Pick<TripColumns, "budgetPaise" | "budgetBasis">): Budget | null {
  if (row.budgetPaise === null || row.budgetBasis === null) return null;
  return {
    amount: { amountPaise: Number(row.budgetPaise), currency: "INR" },
    basis: budgetBasis.parse(row.budgetBasis),
  };
}

const orNull = <T>(value: string | null, parse: (stored: string) => T): T | null =>
  value === null ? null : parse(value);

/** The trip whole, as the lead page and a repeat enquiry show it; `names` holds its destination's name. */
export function tripDetailOf(row: TripColumns, names: ReadonlyMap<string, string>): TripDetail {
  const name = row.destinationId === null ? undefined : names.get(row.destinationId);
  return {
    destination: row.destinationId === null || name === undefined ? null : { id: row.destinationId, name },
    when: travelWhenOf(row),
    adults: row.adults,
    childrenAges: row.childrenAges,
    budget: budgetOf(row),
    departureCity: row.departureCity,
    tripType: orNull(row.tripType, (stored) => tripType.parse(stored)),
    hotelCategory: orNull(row.hotelCategory, (stored) => hotelCategory.parse(stored)),
    food: orNull(row.food, (stored) => foodPreference.parse(stored)),
    roomType: row.roomType,
  };
}

/** The trip in one line's worth, as the list shows it. */
export function tripSummaryOf(
  row: Pick<TripColumns, "destinationId" | "travelKind" | "travelStart" | "travelEnd" | "travelMonth" | "adults"> & {
    childrenCount: number;
  },
  names: ReadonlyMap<string, string>,
): TripSummary {
  return {
    destinationName: row.destinationId === null ? null : (names.get(row.destinationId) ?? null),
    when: travelWhenOf(row),
    adults: row.adults,
    childrenCount: row.childrenCount,
  };
}
