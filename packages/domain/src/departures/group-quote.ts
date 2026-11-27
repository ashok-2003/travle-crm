// A group trip's quote (group packages): one line per room type, priced from the departure's own prices or the season of its
// first day, for a party that fits the departure's free seats. Prices that include GST are split back into the pre-tax
// subtotal the quote adds its GST to, so the total the customer was told is the total on the quote.
import { quoteTaxRate, roomCapacity, type MakeGroupQuoteInput, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, parseCalendarDate, type Actor, type CalendarDate } from "../kernel/index.js";
import {
  createQuoteFor,
  daysOf,
  findPackage,
  groupTotal,
  getQuote,
  priceOn,
  seasonsOf,
  type QuoteContext,
} from "../quotes/index.js";
import { getLead } from "../crm/index.js";
import { assertDepartureTakes } from "./assert-takes.js";
import { dayOf, findDeparture, ownPricesOf } from "./rows.js";

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
  // The lead must be the member's to see; another's is "not found", as everywhere.
  await getLead(tx, access, input.leadId);
  const made = await makeGroupQuoteFor(tx, access, input, context, today);
  return getQuote(tx, access, made.id);
}

/** The same quote for whoever acts, the lead already known to exist (the AI's booking acts as the system). Returns its id and total. */
export async function makeGroupQuoteFor(
  tx: OrgTx,
  actor: Actor,
  input: MakeGroupQuoteInput,
  context: QuoteContext,
  today: CalendarDate,
): Promise<{ id: string; totalPaise: bigint }> {
  const row = await findPackage(tx, input.packageId);
  const departure = await findDeparture(tx, input.departureId);
  const startDate = parseCalendarDate(dayOf(departure.startDate));
  // For callers that skip the contract: two lines of one room type are one line.
  if (new Set(input.rooms.map((room) => room.roomType)).size !== input.rooms.length) {
    throw new DomainError("VALIDATION", "DUPLICATE_ROOM_TYPE", "Each room type may appear once");
  }
  const people = input.rooms.reduce((sum, room) => sum + room.people, 0);
  const children = input.rooms.reduce((sum, room) => sum + (roomCapacity[room.roomType] === null ? room.people : 0), 0);
  // A child's place is booked beside an adult's; a party of children alone has nobody to travel with.
  if (children === people) {
    throw new DomainError("VALIDATION", "CHILDREN_NEED_ADULT", "Children travel with at least one adult");
  }
  await assertDepartureTakes(tx, departure, row.id, people, today, context.now);
  const offered = row.roomTypes as RoomType[];
  const priced = priceOn(
    startDate,
    await seasonsOf(tx, row.id),
    { title: departure.title, prices: ownPricesOf(departure) },
    offered,
  );
  if (priced === null) {
    throw new DomainError("CONFLICT", "NO_PRICE_FOR_DATE", "No season prices this departure's day");
  }
  const rate = quoteTaxRate.catch(500).parse(row.taxRateBasisPoints);
  const total = groupTotal(priced.prices, input.rooms, {
    pricesIncludeGst: row.pricesIncludeGst,
    taxRateBasisPoints: rate,
    supplierStateCode: context.supplierStateCode ?? "",
  });
  if (!total.ok) throw new DomainError("CONFLICT", "ROOM_NOT_PRICED", "These rooms can't be priced");
  const items = total.lines.map((line) => ({
    description: `${row.name}, ${roomLabel[line.roomType]} × ${String(line.people)}`,
    detail: "",
    quantity: 1,
    unitPricePaise: line.sharePaise,
  }));
  const quote = await createQuoteFor(
    tx,
    actor,
    {
      leadId: input.leadId,
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
  );
  await tx.quote.update({ where: { id: quote.id }, data: { templateId: row.id, departureId: departure.id } });
  return quote;
}
