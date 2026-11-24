// The natural agent's read tools (spec 3.3): find_trips and get_trip over the sellable trips, and quote, which prices a
// group on an open departure as a booking will charge it. Each answers text for the model; a refusal names the way on.
import { findTripsArguments, getTripArguments, parseToolArguments, quoteArguments } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { datesOnSale } from "../trips/dates-on-sale.js";
import { MOST_DEPARTURES, tripSheetsOf } from "../trips/trip-sheets.js";
import { tripIndexEntry, tripInFull, tripsAre } from "../trips/trip-text.js";
import type { QuoteFigures, ReadContext, TripSheet } from "../types.js";
import { findTrips, monthsNamed, monthWords } from "./find-trips.js";
import { quoteOf } from "./quote.js";

export type { ReadContext } from "../types.js";
export { quoteFor } from "./quote.js";

/** Each trip's priced dates on sale, read from the data: all of them, past the 8 a sheet lists. */
async function pricedDates(context: ReadContext): Promise<Map<string, CalendarDate[]>> {
  const ids = context.sheets.map((sheet) => sheet.packageId);
  const onSale = await datesOnSale(context.tx, ids, context.today, context.now);
  return new Map(
    [...onSale].map(([id, trip]) => [id, trip.dates.flatMap((one) => (one.prices === null ? [] : [one.startsOn]))]),
  );
}

/** Up to 5 short entries, a blank line apart; a month asked is read from the data, and each shows its dates in that month. */
async function tripsFound(context: ReadContext, query: string): Promise<string> {
  const { sheets, today } = context;
  const months = monthsNamed(query, today);
  const datesOf = months.length === 0 ? undefined : await pricedDates(context);
  const found = findTrips(sheets, query, today, datesOf);
  const inMonths = (sheet: TripSheet) =>
    (datesOf?.get(sheet.packageId) ?? []).filter((day) => months.some((month) => day.startsWith(month)));
  const lines = (list: readonly TripSheet[], dated = months.length > 0) =>
    list.map((sheet) => fenced(tripIndexEntry(sheet, today, dated ? inMonths(sheet) : undefined))).join("\n\n");
  const when = monthWords(months, today);
  const words = fenced(found.words === "" ? query : found.words);

  if (found.exact.length > 0) return lines(found.exact);
  if (found.closest.length > 0) return `closest, not a match:\n${lines(found.closest)}`;
  if (found.elsewhen.length > 0) {
    return `none of the trips matching "${words}" leaves in ${when}; their next dates:\n${lines(found.elsewhen, false)}`;
  }
  const trips = tripsAre([...context.labels.keys()]);
  if (months.length === 0) return `no title, place, stop or pickup says "${words}"; ${trips}`;
  const nothing = found.words === "" ? "" : `nothing matches "${words}"; `;
  return found.inMonth.length > 0
    ? `${nothing}leaving in ${when}:\n${lines(found.inMonth)}`
    : `${nothing}no trip leaves in ${when}; ${trips}`;
}

/** The trip in full, read again whole: the prompt's sheets cut long owner text, so this is where the rest is. */
async function tripWhole(context: ReadContext, label: string): Promise<string> {
  const packageId = context.labels.get(label);
  const [sheet] =
    packageId === undefined
      ? []
      : await tripSheetsOf(context.tx, [{ id: packageId, kind: "group" }], context.today, context.now, {
          whole: true,
        });
  if (sheet === undefined) return `refused: that trip isn't on sale now; ${tripsAre([...context.labels.keys()])}`;
  const text = fenced(tripInFull({ ...sheet, label }, context.today));
  return sheet.departures.length < MOST_DEPARTURES
    ? text
    : `${text}\nOnly the next ${String(MOST_DEPARTURES)} dates are listed; find_trips with the trip and a month, ` +
        "or quote on a date, reaches later ones.";
}

/** Runs a read tool on its arguments; a call the arguments' schema or the turn's labels refuse answers why. */
export async function runReadTool(
  context: ReadContext,
  name: "find_trips" | "get_trip" | "quote",
  args: Record<string, unknown>,
): Promise<{ result: string; figures: QuoteFigures | null }> {
  const checked = parseToolArguments(name, args, [...context.labels.keys()]);
  if (!checked.ok) return { result: `refused: ${checked.problem}`, figures: null };
  // The arguments parsed already; each tool reads them typed, and nothing here can throw on them.
  const unparsed = { result: "refused: the arguments weren't understood", figures: null };
  if (name === "find_trips") {
    const parsed = findTripsArguments.safeParse(checked.args);
    return parsed.success ? { result: await tripsFound(context, parsed.data.query), figures: null } : unparsed;
  }
  if (name === "get_trip") {
    const parsed = getTripArguments.safeParse(checked.args);
    return parsed.success ? { result: await tripWhole(context, parsed.data.trip_id), figures: null } : unparsed;
  }
  const parsed = quoteArguments.safeParse(checked.args);
  if (!parsed.success) return unparsed;
  const asked = parsed.data;
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
