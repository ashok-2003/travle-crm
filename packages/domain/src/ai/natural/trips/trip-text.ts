// A trip as the natural agent's context writes it (spec 4.2): in full, or as one index line. Dates carry their weekday,
// money is in rupees with lakh grouping, and seats read "open" or "N left".
import { roomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import { formatRupees, formatShortDay, type CalendarDate } from "../../../kernel/index.js";
import type { PerPersonPrices, TripSheet } from "../types.js";

/** Seats are counted only this few or fewer; above it a departure is "open", so a 500-seat placeholder never shows. */
const FEW_SEATS = 5;
const INDEX_DATES = 3;
const MOST_STOPS = 4;
/** Where a day title's first place ends: " to ", " and ", a dash or arrow between places, a comma, a bracket, a colon. */
const PLACE_END = /\s+(?:to|via|and|-|&)\s+|[,(:;/|–—→]/iu;
const DAY_LABEL = /^day\s*\d+\s*[:.)–—-]?\s*/iu;

const roomNames: Record<RoomType, string> = {
  single: "single",
  double: "double",
  triple: "triple",
  quad: "quad",
  child_bed: "child with bed",
  child_no_bed: "child without bed",
};

const isText = (part: string | null): part is string => part !== null && part !== "";

export function seatWords(freeSeats: number): string {
  return freeSeats > FEW_SEATS ? "open" : `${String(freeSeats)} left`;
}

const pricesWords = (prices: PerPersonPrices) =>
  `${roomTypes
    .flatMap((type) => {
      const price = prices[type];
      return price === undefined ? [] : [`${roomNames[type]} ${formatRupees(price)}`];
    })
    .join(", ")} per person`;

const gstWords = (sheet: TripSheet) =>
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

function headOf(sheet: TripSheet): string {
  return [
    `${sheet.label} ${sheet.title}`,
    sheet.place,
    sheet.nights === null ? null : `${String(sheet.nights)} ${sheet.nights === 1 ? "night" : "nights"}`,
    sheet.startCity === "" ? null : `from ${sheet.startCity}`,
  ]
    .filter(isText)
    .join(" · ");
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
  const departures = sheet.departures.map(
    (one) =>
      `- ${day(one.startsOn)}: ${seatWords(one.freeSeats)}` +
      (one.perPersonPaise === undefined ? "" : `, this departure's own price: ${pricesWords(one.perPersonPaise)}`),
  );
  return [
    headOf(sheet),
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

export function tripIndexLine(sheet: TripSheet, today: CalendarDate): string {
  const dates = sheet.departures.slice(0, INDEX_DATES).map((one) => formatShortDay(one.startsOn, today));
  const stops = stopsOf(sheet);
  return [
    headOf(sheet),
    sheet.fromPaise === null ? null : `from ${formatRupees(sheet.fromPaise)}`,
    dates.length === 0 ? "no open dates" : dates.join(", "),
    stops.length === 0 ? null : `stops: ${stops.join(", ")}`,
  ]
    .filter(isText)
    .join(" · ");
}
