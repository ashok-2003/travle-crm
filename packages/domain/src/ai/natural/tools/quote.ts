// The natural agent's one quote (pre-flight #21): what a party pays on an open departure, priced as the trip sheet and
// the booking's own quote price it, with a refusal that names the way on. `quote` answers with it; the actions check it.
import type { BookingTerms } from "@travel-crm/contracts/ai";
import { adultRoomTypes, quoteTaxRate, roomCapacity } from "@travel-crm/contracts/quotes";
import { formatRupees, formatShortDay, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import { groupTotal } from "../../../quotes/index.js";
import { fenced } from "../../fenced.js";
import { travellerWords } from "../../lite/context/lead-card.js";
import { ANY_STATE, liteRooms } from "../../lite/lookups/package-reads.js";
import { datesOnSale } from "../trips/dates-on-sale.js";
import { gstWords, pricesWords, roomNames, seatWords, tripsAre } from "../trips/trip-text.js";
import type { PerPersonPrices, QuoteFigures, ReadContext } from "../types.js";

export interface Refused {
  refused: string;
}

/** How many open dates a refusal names: those nearest the date asked. */
const NEAREST = 3;

const refused = (why: string): Refused => ({ refused: `refused: ${why}` });
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b));

/** The quote's figures and its words for the model, or why not. */
export async function quoteOf(
  context: ReadContext,
  terms: BookingTerms,
): Promise<{ figures: QuoteFigures; words: string } | Refused> {
  const { tx, today, now } = context;
  const notOnSale = refused(`that trip isn't on sale now; ${tripsAre([...context.labels.keys()])}`);
  const sheet = context.sheets.find((one) => one.packageId === terms.packageId);
  if (sheet === undefined) return notOnSale;
  const [row, onSale] = await Promise.all([
    tx.quoteTemplate.findUnique({
      where: { id: sheet.packageId },
      select: { pricesIncludeGst: true, taxRateBasisPoints: true, advancePerPersonPaise: true },
    }),
    datesOnSale(tx, [sheet.packageId], today, now),
  ]);
  const advance = row?.advancePerPersonPaise ?? null;
  const trip = onSale.get(sheet.packageId);
  if (row === null || advance === null || trip === undefined) return notOnSale;
  const { offered, dates } = trip;
  const party = terms.adults + terms.childrenAges.length;
  const startsOn = parseCalendarDate(terms.startsOn);
  const day = (date: CalendarDate) => formatShortDay(date, today);
  /** The way on: the priced open dates nearest the one asked that seat the party, in date order. */
  const nearest = () => {
    const chosen = dates
      .filter((one) => one.freeSeats >= party && one.prices !== null)
      .sort((a, b) => daysApart(a.startsOn, startsOn) - daysApart(b.startsOn, startsOn))
      .slice(0, NEAREST)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    return chosen.length === 0 ? "none" : chosen.map((one) => day(one.startsOn)).join(", ");
  };

  const departure = dates.find((one) => one.startsOn === startsOn);
  if (departure === undefined) return refused(`no departure on ${day(startsOn)}; open: ${nearest()}`);
  if (departure.freeSeats < party) {
    const seats = `${String(departure.freeSeats)} left on ${day(startsOn)} and the party is ${String(party)}`;
    return refused(`${seats}; open with seats: ${nearest()}`);
  }
  const { prices } = departure;
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
    // Only a child's place can be unpriced here: the adults' room was checked above, and no room of theirs helps.
    if (total.reason === "NO_PRICE") {
      return refused(`${name} isn't priced for ${day(startsOn)}; ask the team with create_task(question)`);
    }
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
  const advancePerPersonPaise = Number(advance);
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
 * The quote `offer_booking` and `book` check their terms against, so the total told is the total booked. `terms.room`
 * comes back as the room the quote used.
 */
export async function quoteFor(context: ReadContext, terms: BookingTerms): Promise<QuoteFigures | Refused> {
  const outcome = await quoteOf(context, terms);
  return "refused" in outcome ? outcome : outcome.figures;
}
