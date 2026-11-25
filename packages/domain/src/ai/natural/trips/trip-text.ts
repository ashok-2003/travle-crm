// A trip as the natural agent's context writes it (spec 4.2): in full, or as one index line. Dates carry their weekday,
// money is in rupees with lakh grouping, and seats read "open" or "N left".
import { adultRoomTypes, roomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import { formatRupees, formatShortDay, type CalendarDate } from "../../../kernel/index.js";
import type { PerPersonPrices, TripSheet } from "../types.js";

/** Seats are counted only this few or fewer; above it a departure is "open", so a 500-seat placeholder never shows. */
const FEW_SEATS = 5;
const INDEX_DATES = 3;
/** Dates a lookup's line shows for the month asked, before "and N more". */
const MONTH_DATES = 5;
const MOST_STOPS = 4;
/** Where a day title's first place ends: " to ", " and ", a dash or arrow between places, a comma, a bracket, a colon. */
const PLACE_END = /\s+(?:to|via|and|-|&)\s+|[,(:;/|–—→]/iu;
const DAY_LABEL = /^day\s*\d+\s*[:.)–—-]?\s*/iu;

export const roomNames: Record<RoomType, string> = {
  single: "single",
  double: "double",
  triple: "triple",
  quad: "quad",
  child_bed: "child with bed",
  child_no_bed: "child without bed",
};

export const isText = (part: string | null): part is string => part !== null && part !== "";

export function seatWords(freeSeats: number): string {
  return freeSeats > FEW_SEATS ? "open" : `${String(freeSeats)} left`;
}

/**
 * "triple ₹9,499, double ₹10,999, child with bed ₹6,000 per person": the cheapest room first, since the model quoted the first
 * price on the line as the trip's starting price (live, 2026-11-21: double's ₹6,000 for quad's ₹5,000); a child's prices after.
 */
export const pricesWords = (prices: PerPersonPrices) =>
  `${roomTypes
    .flatMap((type) => {
      const price = prices[type];
      return price === undefined ? [] : [{ type, price }];
    })
    .sort((one, other) => rankOf(one) - rankOf(other))
    .map(({ type, price }) => `${roomNames[type]} ${formatRupees(price)}`)
    .join(", ")} per person`;

/** Adult rooms by price, then a child's prices in their own order (the sort is stable). */
const rankOf = ({ type, price }: { type: RoomType; price: number }) =>
  adultRoomTypes.includes(type) ? price : Number.MAX_SAFE_INTEGER;

export const gstWords = (sheet: Pick<TripSheet, "pricesIncludeGst" | "taxRateBasisPoints">) =>
  sheet.pricesIncludeGst
    ? "GST included"
    : sheet.taxRateBasisPoints === 0
      ? "no GST"
      : `plus ${String(sheet.taxRateBasisPoints / 100)}% GST`;

/** Owner text on one line: its lines joined, with "; " where a line ended without a stop. */
const oneLine = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s+/u, "").trim())
    .filter((line) => line !== "")
    .reduce((joined, line) => (joined === "" ? line : `${joined}${/[.;:,!?]$/u.test(joined) ? " " : "; "}${line}`), "");

const labelled = (name: string, text: string) => (text === "" ? null : `${name}: ${oneLine(text)}`);

/** A trip's first lines, labelled, so its ID reads as a tool's handle and never as part of its name. */
function headOf(sheet: TripSheet): (string | null)[] {
  const where = [
    sheet.place,
    sheet.nights === null ? null : `${String(sheet.nights)} ${sheet.nights === 1 ? "night" : "nights"}`,
    sheet.startCity === "" ? null : `from ${sheet.startCity}`,
  ]
    .filter(isText)
    .join(" · ");
  return [`Trip ID: ${sheet.label}`, `Name: ${sheet.title}`, where === "" ? null : `Where: ${where}`];
}

/** The main stops: each day title's first place, without the start city or a repeat, 4 at most. */
function stopsOf(sheet: TripSheet): string[] {
  const seen = new Set([sheet.startCity.toLowerCase()]);
  const stops: string[] = [];
  for (const day of sheet.days) {
    const place = (day.title.replace(DAY_LABEL, "").split(PLACE_END)[0] ?? "").trim();
    if (place === "" || seen.has(place.toLowerCase())) continue;
    seen.add(place.toLowerCase());
    stops.push(place);
    if (stops.length === MOST_STOPS) break;
  }
  return stops;
}

export function tripInFull(sheet: TripSheet, today: CalendarDate): string {
  const day = (date: CalendarDate) => formatShortDay(date, today);
  const seasons = sheet.seasons.map(
    (season) => `- ${season.name} (${day(season.from)}–${day(season.until)}): ${pricesWords(season.perPersonPaise)}`,
  );
  const priceOfDate = (one: TripSheet["departures"][number]) =>
    one.priceFrom === "departure"
      ? `; this date's own prices replace the season's: ${pricesWords(one.perPersonPaise)}`
      : one.priceFrom === "none"
        ? "; no price set for this date"
        : "";
  const departures = sheet.departures.map(
    (one) => `- ${day(one.startsOn)}: ${seatWords(one.freeSeats)}${priceOfDate(one)}`,
  );
  return [
    ...headOf(sheet),
    labelled("Summary", sheet.summary),
    sheet.highlights.length === 0 ? null : `Highlights: ${sheet.highlights.join("; ")}`,
    ...sheet.days.map(
      (one, index) => `Day ${String(index + 1)}, ${one.title}` + (one.text === "" ? "" : `: ${oneLine(one.text)}`),
    ),
    sheet.pickups.length === 0 ? null : `Pickup points: ${sheet.pickups.join("; ")}`,
    labelled("Includes", sheet.inclusions),
    labelled("Excludes", sheet.exclusions),
    labelled("Notes", sheet.notes),
    labelled("Cancellation", sheet.cancellation),
    sheet.rooms.length === 0 ? null : `Rooms: ${sheet.rooms.map((room) => roomNames[room]).join(", ")}`,
    sheet.fromPaise === null ? null : `Starts at ${formatRupees(sheet.fromPaise)} per person, the lowest room's price`,
    `Prices, ${gstWords(sheet)}:${seasons.length === 0 ? " by departure, below" : ""}`,
    ...seasons,
    sheet.advancePerPersonPaise === null
      ? null
      : `To book: advance ${formatRupees(sheet.advancePerPersonPaise)} per person`,
    `Departures:${departures.length === 0 ? " no open dates" : ""}`,
    ...departures,
  ]
    .filter(isText)
    .join("\n");
}

/** A trip's short entry, a label a line; `dates`, when given (a month a lookup asked), replace the next 3: the first 5, then how many more. */
export function tripIndexEntry(sheet: TripSheet, today: CalendarDate, dates?: readonly CalendarDate[]): string {
  const shown = dates?.slice(0, MONTH_DATES) ?? sheet.departures.slice(0, INDEX_DATES).map((one) => one.startsOn);
  const total = dates?.length ?? sheet.departures.length;
  const more = total > shown.length ? ` and ${String(total - shown.length)} more` : "";
  const stops = stopsOf(sheet);
  return [
    ...headOf(sheet),
    sheet.fromPaise === null
      ? null
      : `Price: from ${formatRupees(sheet.fromPaise)} per person, the lowest room (quote or get_trip gives each room's)`,
    `Dates: ${shown.length === 0 ? "no open dates" : `${shown.map((day) => formatShortDay(day, today)).join(", ")}${more}`}`,
    stops.length === 0 ? null : `Stops: ${stops.join(", ")}`,
  ]
    .filter(isText)
    .join("\n");
}

/** The way on when a lookup names no trip: "the trips are T1, T2", or "the trips are T1–T40" for many. */
export function tripsAre(labels: readonly string[]): string {
  if (labels.length === 0) return "the agency has no trips listed";
  const list = labels.length <= 3 ? labels.join(", ") : `${labels[0] ?? ""}–${labels.at(-1) ?? ""}`;
  return `the trips are ${list}`;
}
