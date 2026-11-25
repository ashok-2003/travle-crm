// The trip as the AI change assistant's model reads it: numbered text (S1 price columns, D1 departures, N1 notes) with
// its prices, days, repeats, seats, advance and details, all in one block the prompt fences as data.
import type { RoomPrices, RoomType } from "@travel-crm/contracts/quotes";
import { formatRupees, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import type { TripSnapshot } from "./snapshot-types.js";

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
export function textOf(snapshot: Omit<TripSnapshot, "text">): string {
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
    // Numbered, not "Day 1:", since a day's own title often starts with that.
    "Itinerary (title | description):",
    ...(trip.days.length === 0
      ? ["(none)"]
      : trip.days.map(
          (day, index) =>
            `${String(index + 1)}. ${day.title}${day.description.trim() === "" ? "" : ` | ${day.description.replace(/\s+/g, " ")}`}`,
        )),
    `AI selling it: ${trip.aiSellable ? "on" : "off"}`,
  ].join("\n");
}
