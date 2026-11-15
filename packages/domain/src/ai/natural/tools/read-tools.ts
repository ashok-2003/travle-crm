// The natural agent's read tools (spec 3.3): find_trips and get_trip over the sellable trips, and quote, which prices a
// group on an open departure as a booking will charge it. Each answers text for the model; a refusal names the way on.
import {
  findTripsArguments,
  getTripArguments,
  parseToolArguments,
  quoteArguments,
  type BookingTerms,
} from "@travel-crm/contracts/ai";
import { adultRoomTypes, quoteTaxRate, roomCapacity, roomTypes } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetails, type OpenDepartureDetail } from "../../../departures/index.js";
import { addDays, formatRupees, formatShortDay, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import { groupTotal, priceOn, seasonsOf } from "../../../quotes/index.js";
import { fenced } from "../../fenced.js";
import { travellerWords } from "../../lite/context/lead-card.js";
import { ANY_STATE, liteRooms } from "../../lite/lookups/package-reads.js";
import { tripSheetsOf } from "../trips/trip-sheets.js";
import { gstWords, pricesWords, roomNames, seatWords, tripIndexLine, tripInFull } from "../trips/trip-text.js";
import type { PerPersonPrices, QuoteFigures, TripSheet } from "../types.js";
import { findTrips } from "./find-trips.js";

export interface ReadContext {
  tx: OrgTx;
  sheets: readonly TripSheet[];
  /** Label to package id. */
  labels: ReadonlyMap<string, string>;
  today: CalendarDate;
  now: Date;
}
interface Refused {
  refused: string;
}
interface Quote {
  figures: QuoteFigures;
  words: string;
}

/** How many open dates a refusal names: those nearest the date asked. */
const NEAREST = 3;

const refused = (why: string): Refused => ({ refused: `refused: ${why}` });
const notOnSale = (context: ReadContext) => {
  const labels = [...context.labels.keys()];
  return refused(
    `that trip isn't on sale now; ${labels.length > 0 ? `the trips are ${labels.join(", ")}` : "the agency has no trips listed"}`,
  );
};
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b));

/** What the party pays on the departure of `terms.startsOn`, priced as the trip sheet and the booking's quote price it. */
async function quoteOf(context: ReadContext, terms: BookingTerms): Promise<Quote | Refused> {
  const { tx, today, now } = context;
  const sheet = context.sheets.find((one) => one.packageId === terms.packageId);
  if (sheet === undefined) return notOnSale(context);
  const [row, open, seasons] = await Promise.all([
    tx.quoteTemplate.findUnique({
      where: { id: sheet.packageId },
      select: { roomTypes: true, pricesIncludeGst: true, taxRateBasisPoints: true, advancePerPersonPaise: true },
    }),
    // The departures the trip sheet lists: open, with a free seat, leaving tomorrow or later.
    openDepartureDetails(tx, sheet.packageId, today, now, addDays(today, 1)),
    seasonsOf(tx, sheet.packageId),
  ]);
  const advance = row?.advancePerPersonPaise ?? null;
  if (row === null || advance === null) return notOnSale(context);
  const advancePerPersonPaise = Number(advance);
  const offered = roomTypes.filter((type) => row.roomTypes.includes(type));
  const party = terms.adults + terms.childrenAges.length;
  const startsOn = parseCalendarDate(terms.startsOn);
  const day = (date: CalendarDate) => formatShortDay(date, today);
  /** A date's prices by `priceOn`, the quote's own rule; null when no adult room has one. */
  const pricesOn = (one: OpenDepartureDetail) => {
    const prices = priceOn(one.startsOn, seasons, one, offered)?.prices ?? null;
    return prices !== null && adultRoomTypes.some((type) => prices[type] !== null) ? prices : null;
  };
  /** The way on: the priced open dates nearest the one asked that seat the party, in date order. */
  const nearest = () => {
    const chosen = open
      .filter((one) => one.freeSeats >= party && pricesOn(one) !== null)
      .sort((a, b) => daysApart(a.startsOn, startsOn) - daysApart(b.startsOn, startsOn))
      .slice(0, NEAREST)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    return chosen.length === 0 ? "none" : chosen.map((one) => day(one.startsOn)).join(", ");
  };

  const departure = open.find((one) => one.startsOn === startsOn);
  if (departure === undefined) return refused(`no departure on ${day(startsOn)}; open: ${nearest()}`);
  if (departure.freeSeats < party) {
    const seats = `${String(departure.freeSeats)} left on ${day(startsOn)} and the party is ${String(party)}`;
    return refused(`${seats}; open with seats: ${nearest()}`);
  }
  const prices = pricesOn(departure);
  if (prices === null) return refused(`no price is set for ${day(startsOn)}; open: ${nearest()}`);
  const priced = `priced: ${adultRoomTypes
    .filter((type) => prices[type] !== null)
    .map((type) => roomNames[type])
    .join(", ")}`;
  const children =
    terms.childrenAges.length === 0 ? null : { count: terms.childrenAges.length, ages: terms.childrenAges };
  const rooms = liteRooms({ adults: terms.adults, children, roomType: terms.room }, offered);
  const room = rooms[0]?.roomType;
  if (room === undefined) return refused(`room is needed for this trip; ${priced}`);
  if (!adultRoomTypes.includes(room)) {
    return refused(`${roomNames[room]} is a child's place, not a room for the adults; ${priced}`);
  }
  const perPersonPaise = prices[room];
  if (perPersonPaise === null) return refused(`${roomNames[room]} isn't priced; ${priced}`);
  const tax = {
    pricesIncludeGst: row.pricesIncludeGst,
    taxRateBasisPoints: quoteTaxRate.catch(500).parse(row.taxRateBasisPoints),
  };
  const total = groupTotal(prices, rooms, { ...tax, supplierStateCode: ANY_STATE }, offered);
  if (!total.ok) {
    const name = roomNames[total.roomType];
    if (total.reason === "NO_PRICE") return refused(`${name} isn't priced; ${priced}`);
    const people = rooms.find((one) => one.roomType === total.roomType)?.people ?? party;
    return refused(
      `${String(people)} people don't fill ${name} rooms of ${String(roomCapacity[total.roomType])}; ${priced}`,
    );
  }

  const charged: PerPersonPrices = {};
  for (const { roomType } of rooms) {
    const price = prices[roomType];
    if (price !== null) charged[roomType] = price;
  }
  const advancePaise = advancePerPersonPaise * party;
  // A trek of triple tents has no double to give: the quote uses its one room, whatever room was asked, and says so.
  const onlyRoom =
    terms.room !== null && terms.room !== room ? ` (${roomNames[room]} is the only room this trip sells)` : "";
  const travellers = travellerWords(terms.adults, terms.childrenAges) ?? "";
  const words = [
    `${sheet.label} ${sheet.title}, ${day(startsOn)}, ${travellers}: ${pricesWords(charged)}${onlyRoom}, ${gstWords(tax)}`,
    `total ${formatRupees(total.totalPaise)}`,
    `advance ${formatRupees(advancePerPersonPaise)} per person, ${formatRupees(advancePaise)} in all`,
    `seats: ${seatWords(departure.freeSeats)}`,
  ].join("; ");
  return {
    figures: {
      terms: { ...terms, room },
      departureId: departure.id,
      perPersonPaise,
      totalPaise: total.totalPaise,
      advancePaise,
      advancePerPersonPaise,
      freeSeats: departure.freeSeats,
    },
    words: fenced(words),
  };
}

/**
 * The one quote of the natural agent (pre-flight #21): `quote` answers with it, and `offer_booking` and `book` check
 * their terms against it, so the total told is the total booked. `terms.room` comes back as the room the quote used.
 */
export async function quoteFor(context: ReadContext, terms: BookingTerms): Promise<QuoteFigures | Refused> {
  const outcome = await quoteOf(context, terms);
  return "refused" in outcome ? outcome : outcome.figures;
}

/** Up to 5 index lines; a near spelling is "closest, not a match". */
function tripsFound(context: ReadContext, query: string): string {
  const { exact, closest } = findTrips(context.sheets, query, context.today);
  const lines = (found: readonly TripSheet[]) =>
    found.map((sheet) => fenced(tripIndexLine(sheet, context.today))).join("\n");
  if (exact.length > 0) return lines(exact);
  if (closest.length > 0) return `closest, not a match:\n${lines(closest)}`;
  return `no trip matches "${fenced(query)}"`;
}

/** The trip in full, read again whole: the prompt's sheets cut long owner text, so this is where the rest is. */
async function tripWhole(context: ReadContext, label: string): Promise<string> {
  const packageId = context.labels.get(label);
  const [sheet] =
    packageId === undefined
      ? []
      : await tripSheetsOf(context.tx, [{ id: packageId, kind: "group" }], context.today, context.now, { whole: true });
  return sheet === undefined ? notOnSale(context).refused : fenced(tripInFull({ ...sheet, label }, context.today));
}

/** Runs a read tool on its arguments; a call the arguments' schema or the turn's labels refuse answers why. */
export async function runReadTool(
  context: ReadContext,
  name: "find_trips" | "get_trip" | "quote",
  args: Record<string, unknown>,
): Promise<{ result: string; figures: QuoteFigures | null }> {
  const checked = parseToolArguments(name, args, [...context.labels.keys()]);
  if (!checked.ok) return { result: `refused: ${checked.problem}`, figures: null };
  if (name === "find_trips") {
    return { result: tripsFound(context, findTripsArguments.parse(checked.args).query), figures: null };
  }
  if (name === "get_trip") {
    return { result: await tripWhole(context, getTripArguments.parse(checked.args).trip_id), figures: null };
  }
  const asked = quoteArguments.parse(checked.args);
  const outcome = await quoteOf(context, {
    packageId: context.labels.get(asked.trip_id) ?? "",
    startsOn: asked.date,
    adults: asked.adults,
    childrenAges: asked.children_ages,
    room: asked.room ?? null,
    payInFull: false,
  });
  return "refused" in outcome
    ? { result: outcome.refused, figures: null }
    : { result: outcome.words, figures: outcome.figures };
}
