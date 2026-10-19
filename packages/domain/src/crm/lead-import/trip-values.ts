// A row's trip (spec B20, B21): where, when, who, the budget and the preferences, read from the row's cells. What can't
// be read is returned as lines for the lead's note, so the row is still added.
import { destinationName } from "@travel-crm/contracts/catalog";
import {
  foodPreference,
  hotelCategory,
  keyOfWord,
  tripType,
  type BudgetBasis,
  type LeadImportField,
  type TripInput,
} from "@travel-crm/contracts/crm";
import { readBudget } from "./budget-values.js";
import { readAdults, readChildrenAges, readChildrenCount, readDay, readMonth, type DayOptions } from "./row-values.js";

/** A row's cells by the field their column is matched to; null for an empty cell or an unmatched field. */
export type RowCell = (field: LeadImportField) => string | null;

export interface TripReading {
  trip: TripInput;
  /** The destination's name as the file gave it, for the preview's new destinations; null for none. */
  destinationName: string | null;
  /** Lines for the note, "Travel date: next winter", for what couldn't be read. */
  kept: string[];
}

const SHORT_TEXT_MAX = 120;

/** A list value ("Honeymoon", "4 star", "Jain") by the fixed list's words; what isn't one is kept for the note. */
function listed<Key extends string>(
  cell: string | null,
  field: "tripType" | "hotelCategory" | "food",
  label: string,
  allowed: readonly Key[],
  kept: string[],
): Key | null {
  if (cell === null) return null;
  const key = keyOfWord(field, cell);
  const found = allowed.find((candidate) => candidate === key);
  if (found === undefined) kept.push(`${label}: ${cell}`);
  return found ?? null;
}

function shortText(cell: string | null, label: string, kept: string[]): string | null {
  if (cell === null) return null;
  if (cell.length <= SHORT_TEXT_MAX) return cell;
  kept.push(`${label}: ${cell}`);
  return null;
}

type When = TripInput["when"];

function readWhen(cell: RowCell, dayOptions: DayOptions, kept: string[]): When {
  const [fromText, toText, monthText] = [cell("travel_from"), cell("travel_to"), cell("travel_month")];
  const from = fromText === null ? null : readDay(fromText, dayOptions);
  const to = toText === null ? null : readDay(toText, dayOptions);
  if (fromText !== null && from === null) kept.push(`Travel date: ${fromText}`);
  if (toText !== null && (to === null || from === null || to < from)) kept.push(`Travel end date: ${toText}`);
  const month = monthText === null ? null : readMonth(monthText);
  if (from !== null) {
    if (monthText !== null) kept.push(`Travel month: ${monthText}`);
    return { kind: "dates", from, to: to !== null && to >= from ? to : from };
  }
  if (monthText !== null && month === null) kept.push(`Travel month: ${monthText}`);
  if (month === "flexible") return { kind: "flexible" };
  return month === null ? { kind: "unknown" } : { kind: "month", month };
}

function readChildren(cell: RowCell, kept: string[]): number[] {
  const [agesText, countText] = [cell("children_ages"), cell("children_count")];
  const ages = agesText === null ? [] : readChildrenAges(agesText);
  if (ages === null) kept.push(`Children's ages: ${agesText ?? ""}`);
  const count = countText === null ? null : readChildrenCount(countText);
  if (countText !== null && count === null) kept.push(`Children: ${countText}`);
  if (count !== null && count > 0 && (ages ?? []).length === 0) kept.push(`Children: ${String(count)}, ages not given`);
  if (count !== null && ages !== null && ages.length > 0 && count !== ages.length) {
    kept.push(`Children: ${String(count)}, but ages are given for ${String(ages.length)}`);
  }
  return ages ?? [];
}

export function readTrip(cell: RowCell, options: { defaultBasis: BudgetBasis; dayOptions: DayOptions }): TripReading {
  const kept: string[] = [];
  const destinationText = cell("destination");
  const parsedDestination = destinationText === null ? null : destinationName.safeParse(destinationText);
  if (parsedDestination?.success === false) kept.push(`Destination: ${destinationText ?? ""}`);
  const destination = parsedDestination?.success === true ? parsedDestination.data : null;

  const when = readWhen(cell, options.dayOptions, kept);
  const adultsText = cell("adults");
  const adults = adultsText === null ? null : readAdults(adultsText);
  if (adultsText !== null && adults === null) kept.push(`Adults: ${adultsText}`);
  const childrenAges = readChildren(cell, kept);
  const { budget, kept: budgetKept } = readBudget(cell("budget"), cell("budget_basis"), options.defaultBasis);
  kept.push(...budgetKept);

  const trip: TripInput = {
    destination: destination === null ? null : { kind: "new", name: destination },
    when,
    adults,
    childrenAges,
    budget,
    departureCity: shortText(cell("departure_city"), "Departure city", kept),
    tripType: listed(cell("trip_type"), "tripType", "Trip type", tripType.options, kept),
    hotelCategory: listed(cell("hotel_category"), "hotelCategory", "Hotel category", hotelCategory.options, kept),
    food: listed(cell("food"), "food", "Food", foodPreference.options, kept),
    roomType: shortText(cell("room_type"), "Room type", kept),
  };
  return { trip, destinationName: destination, kept };
}
