// Finds the trips a lookup asks for (find_trips): whole words of the title, place, itinerary stops and pickup points,
// the trips matching more of the words first, a near spelling only as "closest", kept to the months the query names.
import type { CalendarDate } from "../../../kernel/index.js";
import { findPackages, meaningful } from "../../lite/lookups/find-packages.js";
import { MONTHS } from "../../lite/read-numbers.js";
import { wordsOf } from "../../lite/read-words.js";
import type { PackageIndexEntry } from "../../lite/types.js";
import { indexEntryOf } from "../trips/trip-sheets.js";
import type { TripSheet } from "../types.js";

const MOST_FOUND = 5;
/** Shorter words ("in", "ka", "am") join a query or a stop; they never name a trip. */
const SHORTEST = 3;
/** Words that join the places in a day title ("Sankri to Juda ka Talab", "summit and back"). */
const JOINING = new Set(["and", "via", "day", "back"]);

export interface TripsFound {
  /** The trips the words name, most words first, or every trip when the query names only months; in a month asked. */
  exact: TripSheet[];
  /** Near spellings in a month asked, when no word names a trip. */
  closest: TripSheet[];
  /** The trips the words name, when none of them leaves in a month asked. */
  elsewhen: TripSheet[];
  /** When the words name no trip, not even closely: the trips leaving in a month asked. */
  inMonth: TripSheet[];
  /** The months asked, as yyyy-mm. */
  months: string[];
  /** The words searched, months and joining words left out ("" for none). */
  words: string;
}

/** The place words of a trip's day titles and pickup points: no number, no joining word, nothing under 3 letters. */
function placeWordsOf(sheet: TripSheet): string {
  return wordsOf([...sheet.days.map((day) => day.title), ...sheet.pickups].join(" "))
    .filter((word) => Array.from(word).length >= SHORTEST && !/\d/u.test(word) && !JOINING.has(word))
    .join(" ");
}

/** The month names a query says; "may" counts only written "May", since it is also a verb. */
function monthNamesIn(query: string): Set<string> {
  const said = new Set(wordsOf(query));
  return new Set(MONTHS.flat().filter((name) => said.has(name) && (name !== "may" || /\bMay\b/u.test(query))));
}

/** The months a query names, as yyyy-mm from today: this month, or the next of that name. */
export function monthsNamed(query: string, today: CalendarDate): string[] {
  const names = monthNamesIn(query);
  const year = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  return MONTHS.flatMap((spellings, index) => {
    if (!spellings.some((name) => names.has(name))) return [];
    const month = index + 1;
    return [`${String(month < thisMonth ? year + 1 : year)}-${String(month).padStart(2, "0")}`];
  });
}

/** "December", or "January 2027" in another year; several joined with "or". */
export function monthWords(months: readonly string[], today: CalendarDate): string {
  const name = new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" });
  return months
    .map((month) => {
      const [year = 0, number = 1] = month.split("-").map(Number);
      const words = name.format(new Date(Date.UTC(year, number - 1, 1)));
      return month.startsWith(today.slice(0, 4)) ? words : `${words} ${String(year)}`;
    })
    .join(" or ");
}

/** A word and, for a plural ("treks"), its singular too. */
const formsOf = (word: string) => (word.endsWith("s") && word.length > SHORTEST ? [word, word.slice(0, -1)] : [word]);

/** The sheets' own priced dates: the next 8 at most. A month's lookup passes every date on sale instead. */
const sheetDates = (sheets: readonly TripSheet[]) =>
  new Map(
    sheets.map((sheet) => [
      sheet.packageId,
      sheet.departures.filter((one) => one.priceFrom !== "none").map((one) => one.startsOn),
    ]),
  );

export function findTrips(
  sheets: readonly TripSheet[],
  query: string,
  today: CalendarDate,
  datesOf: ReadonlyMap<string, readonly CalendarDate[]> = sheetDates(sheets),
): TripsFound {
  const months = monthsNamed(query, today);
  const monthNames = monthNamesIn(query);
  // A word that can name no trip ("in", "trips", "tours") is no part of the search.
  const asked = wordsOf(query).filter(
    (word) =>
      !monthNames.has(word) &&
      Array.from(word).length >= SHORTEST &&
      formsOf(word).every((form) => meaningful(form).length > 0),
  );
  const leaves = (sheet: TripSheet) =>
    months.length === 0 ||
    (datesOf.get(sheet.packageId) ?? []).some((day) => months.some((month) => day.startsWith(month)));
  const top = (found: readonly TripSheet[]) => found.slice(0, MOST_FOUND);
  const inMonth = months.length === 0 ? [] : top(sheets.filter(leaves));
  const none: TripsFound = { exact: [], closest: [], elsewhen: [], inMonth: [], months, words: asked.join(" ") };
  if (asked.length === 0) return { ...none, exact: inMonth };

  const index = sheets.map(indexEntryOf);
  const places = new Map(sheets.map((sheet) => [sheet.packageId, placeWordsOf(sheet)]));
  const options = { more: (entry: PackageIndexEntry) => places.get(entry.id) ?? "", most: sheets.length };
  const matched = new Map<string, number>();
  for (const word of asked) {
    const ids = new Set(formsOf(word).flatMap((form) => findPackages(index, form, options).exact.map((one) => one.id)));
    for (const id of ids) matched.set(id, (matched.get(id) ?? 0) + 1);
  }
  if (matched.size > 0) {
    const ranked = sheets
      .filter((sheet) => matched.has(sheet.packageId))
      .sort((a, b) => (matched.get(b.packageId) ?? 0) - (matched.get(a.packageId) ?? 0));
    const exact = top(ranked.filter(leaves));
    return { ...none, exact, elsewhen: exact.length === 0 ? top(ranked) : [] };
  }
  const near = new Set(findPackages(index, asked.join(" "), options).closest.map((entry) => entry.id));
  const closest = top(sheets.filter((sheet) => near.has(sheet.packageId) && leaves(sheet)));
  return closest.length > 0 ? { ...none, closest } : { ...none, inMonth };
}
