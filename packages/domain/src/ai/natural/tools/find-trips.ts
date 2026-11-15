// Finds the trips a lookup asks for (find_trips): whole words of the title, place, itinerary stops and pickup points,
// the trips matching more of the words first, a near spelling only as "closest", kept to a month the query names.
import type { CalendarDate } from "../../../kernel/index.js";
import { findPackages, meaningful } from "../../lite/lookups/find-packages.js";
import { MONTHS } from "../../lite/read-numbers.js";
import { wordsOf } from "../../lite/read-words.js";
import type { PackageIndexEntry } from "../../lite/types.js";
import type { TripSheet } from "../types.js";

const MOST_FOUND = 5;
/** Shorter words ("in", "ka", "am") join a query or a stop; they never name a trip. */
const SHORTEST = 3;
/** Words that join the places in a day title ("Sankri to Juda ka Talab", "summit and back"). */
const JOINING = new Set(["and", "via", "day", "back"]);

/** A trip as lite's `findPackages` reads it: the one mapping, for the turn block, the lookups and the actions. */
export function indexEntryOf(sheet: TripSheet): PackageIndexEntry {
  const { packageId, title, place, nights, startCity } = sheet;
  return { id: packageId, title, place, destinationId: null, nights, startCity };
}

/** The place words of a trip's day titles and pickup points: no number, no joining word, nothing under 3 letters. */
function placeWordsOf(sheet: TripSheet): string {
  return wordsOf([...sheet.days.map((day) => day.title), ...sheet.pickups].join(" "))
    .filter((word) => Array.from(word).length >= SHORTEST && !/\d/u.test(word) && !JOINING.has(word))
    .join(" ");
}

/** The yyyy-mm a month name means from today: this month or the next one of that name. */
function monthsNamed(words: readonly string[], today: CalendarDate): string[] {
  const year = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  return MONTHS.flatMap((names, index) => {
    if (!names.some((name) => words.includes(name))) return [];
    const month = index + 1;
    return [`${String(month < thisMonth ? year + 1 : year)}-${String(month).padStart(2, "0")}`];
  });
}

/** A word and, for a plural ("treks"), its singular too. */
const formsOf = (word: string) => (word.endsWith("s") && word.length > SHORTEST ? [word, word.slice(0, -1)] : [word]);

export function findTrips(
  sheets: readonly TripSheet[],
  query: string,
  today: CalendarDate,
): { exact: TripSheet[]; closest: TripSheet[] } {
  const said = wordsOf(query);
  const months = monthsNamed(said, today);
  const monthWords = new Set(MONTHS.flat());
  // A word that can name no trip ("in", "trips", "tours") is no part of the search.
  const asked = said.filter(
    (word) =>
      !monthWords.has(word) &&
      Array.from(word).length >= SHORTEST &&
      formsOf(word).every((form) => meaningful(form).length > 0),
  );
  const inMonth = (sheet: TripSheet) =>
    months.length === 0 || sheet.departures.some((one) => months.some((month) => one.startsOn.startsWith(month)));
  const keep = (found: readonly TripSheet[]) => found.filter(inMonth).slice(0, MOST_FOUND);
  if (asked.length === 0) return { exact: keep(months.length === 0 ? [] : sheets), closest: [] };

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
    return { exact: keep(ranked), closest: [] };
  }
  const closest = new Set(findPackages(index, asked.join(" "), options).closest.map((entry) => entry.id));
  return { exact: [], closest: keep(sheets.filter((sheet) => closest.has(sheet.packageId))) };
}
