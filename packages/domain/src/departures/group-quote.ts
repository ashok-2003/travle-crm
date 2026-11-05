// A group trip's quote (group packages): one line per room type, priced from the departure's own prices or the season of its
// first day, for a party that fits the departure's free seats. Prices that include GST are split back into the pre-tax
// subtotal the quote adds its GST to, so the total the customer was told is the total on the quote.
import { quoteTaxRate, roomCapacity, type MakeGroupQuoteInput, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, parseCalendarDate, type CalendarDate } from "../kernel/index.js";
import {
  createQuote,
  daysOf,
  exTaxSubtotal,
  findPackage,
  getQuote,
  priceOn,
  quoteMoney,
  seasonsOf,
  totalFor,
  type QuoteContext,
} from "../quotes/index.js";
import { getLead } from "../crm/index.js";
import { countsOf, dayOf, findDeparture, ownPricesOf, seatsSoldAndHeld } from "./rows.js";

/** The words on a quote line. The domain has no translations, so a line is stored in English. */
export const roomLabel: Record<RoomType, string> = {
  single: "Single room",
  double: "Double sharing",
  triple: "Triple sharing",
  quad: "Quad sharing",
  child_bed: "Child with bed",
  child_no_bed: "Child without bed",
};

/** A quote for a lead on one open departure of a group package, one line per room type. */
export async function makeGroupQuote(
  tx: OrgTx,
  access: MemberAccess,
  input: MakeGroupQuoteInput,
  context: QuoteContext,
  today: CalendarDate,
) {
  const lead = await getLead(tx, access, input.leadId);
  const row = await findPackage(tx, input.packageId);
  const departure = await findDeparture(tx, input.departureId);
  const startDate = parseCalendarDate(dayOf(departure.startDate));
  const cutoff = departure.cutoffOn === null ? null : dayOf(departure.cutoffOn);
  if (
    departure.templateId !== row.id ||
    departure.status !== "open" ||
    startDate < today ||
    (cutoff !== null && cutoff < today)
  ) {
    throw new DomainError("CONFLICT", "DEPARTURE_NOT_OPEN", "This departure is not open for booking");
  }
  const people = input.rooms.reduce((sum, room) => sum + room.people, 0);
  const children = input.rooms.reduce((sum, room) => sum + (roomCapacity[room.roomType] === null ? room.people : 0), 0);
  // A child's place is booked beside an adult's; a party of children alone has nobody to travel with.
  if (children === people) {
    throw new DomainError("VALIDATION", "CHILDREN_NEED_ADULT", "Children travel with at least one adult");
  }
  const found = (await seatsSoldAndHeld(tx, [departure.id], context.now)).get(departure.id) ?? { sold: 0, held: 0 };
  if (people > countsOf(departure.seatsTotal, found.sold, found.held).free) {
    throw new DomainError("CONFLICT", "NOT_ENOUGH_SEATS", "There aren't that many seats free on this departure");
  }
  const priced = priceOn(
    startDate,
    await seasonsOf(tx, row.id),
    { title: departure.title, prices: ownPricesOf(departure) },
    row.roomTypes as RoomType[],
  );
  if (priced === null) {
    throw new DomainError("CONFLICT", "NO_PRICE_FOR_DATE", "No season prices this departure's day");
  }
  const total = totalFor(priced.prices, input.rooms);
  if (!total.ok) {
    throw new DomainError(
      total.reason === "ROOM_SPLIT" ? "VALIDATION" : "CONFLICT",
      total.reason === "ROOM_SPLIT" ? "ROOM_SPLIT" : "ROOM_NOT_PRICED",
      "These rooms can't be priced",
    );
  }
  const rate = quoteTaxRate.catch(500).parse(row.taxRateBasisPoints);
  const supplierState = context.supplierStateCode ?? "";
  const lineOf = (description: string, unitPricePaise: number) => ({
    description,
    detail: "",
    quantity: 1,
    unitPricePaise,
  });
  const taxOf = (subtotalPaise: number) =>
    quoteMoney([lineOf("Tour package", subtotalPaise)], rate, supplierState, null).taxPaise;
  const subtotal = row.pricesIncludeGst ? exTaxSubtotal(total.totalPaise, rate, taxOf) : total.totalPaise;
  // Each line takes its share of the subtotal; the last takes what rounding left.
  let given = 0;
  const items = total.lines.map((line, index) => {
    const last = index === total.lines.length - 1;
    const share = last ? subtotal - given : Math.floor((subtotal * line.amountPaise) / total.totalPaise);
    given += share;
    return lineOf(`${row.name}, ${roomLabel[line.roomType]} × ${String(line.people)}`, share);
  });
  const quote = await createQuote(
    tx,
    access,
    {
      leadId: lead.id,
      title: `${row.title} · ${departure.title}`.slice(0, 120),
      startDate,
      adults: people - children,
      children,
      days: daysOf(row),
      items,
      inclusions: row.inclusions,
      exclusions: row.exclusions,
      notes: row.notes.slice(0, 3000),
      taxRateBasisPoints: rate,
      placeOfSupply: null,
    },
    context,
    true,
  );
  await tx.quote.update({ where: { id: quote.id }, data: { templateId: row.id, departureId: departure.id } });
  return getQuote(tx, access, quote.id);
}
