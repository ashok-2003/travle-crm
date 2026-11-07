// The grounded turn's lookup: from what the chat settled, code reads the agency's packages, seasons and departures, so
// that no amount, date or seat count ever comes from a model.
import type { ChatFacts } from "@travel-crm/contracts/ai";
import { adultRoomTypes, quoteTaxRate, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetails, openDeparturesOf } from "../../departures/index.js";
import { addDays, parseCalendarDate, type CalendarDate } from "../../kernel/index.js";
import { fromPrices, groupTotal, packageFilesIn, priceOn, sellablePackages, seasonsOf } from "../../quotes/index.js";
import { autopilotOf } from "../autopilot.js";
import { aiCustomTripsOn } from "../settings.js";
import { roomsFor } from "./rooms.js";

export const MOST_PACKAGES = 5;
import type { Lookup, LookupPackage, PackageWhy } from "./lookup-types.js";
export type { Lookup, LookupPackage, PackageWhy };

const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};
/** Only splits CGST/SGST from IGST, never the total, so the lookup (which has no GST state) may use any valid one. */
const ANY_STATE = "27";
const big = (value: bigint | null) => (value === null ? null : Number(value));

/** Which packages, in which order and for what reason (chosen, then each place's, then the nearest; five at most). */
async function chosenPackages(tx: OrgTx, facts: ChatFacts, today: CalendarDate, nearest: string[]) {
  const sellable = await sellablePackages(tx, today);
  const ids = sellable.map((one) => one.id);
  const destinations = new Map(
    (await tx.quoteTemplate.findMany({ where: { id: { in: ids } }, select: { id: true, destinationId: true } })).map(
      (row) => [row.id, row.destinationId],
    ),
  );
  const picked = new Map<string, PackageWhy>();
  if (facts.packageId !== null && ids.includes(facts.packageId)) picked.set(facts.packageId, { kind: "chosen" });
  for (const place of facts.places) {
    if (place.destinationId === null) continue;
    for (const id of ids) {
      if (destinations.get(id) === place.destinationId && !picked.has(id))
        picked.set(id, { kind: "place", words: place.words });
    }
  }
  for (const id of nearest) {
    if (ids.includes(id) && !picked.has(id)) picked.set(id, { kind: "nearest", words: facts.notRun });
  }
  return [...picked].slice(0, MOST_PACKAGES);
}

/** Where the listed departures start: the day (or month) the customer asked for, never before tomorrow; else today. */
function listFrom(facts: ChatFacts, today: CalendarDate): CalendarDate {
  const asked = facts.startsOn ?? (facts.month === null ? null : `${facts.month}-01`);
  if (asked === null) return today;
  const tomorrow = addDays(today, 1);
  const day = parseCalendarDate(asked);
  return day > tomorrow ? day : tomorrow;
}

export async function lookUp(
  tx: OrgTx,
  facts: ChatFacts,
  today: CalendarDate,
  now: Date,
  nearest: string[],
): Promise<Lookup> {
  const chosen = await chosenPackages(tx, facts, today, nearest);
  const agencyPaymentText = (await autopilotOf(tx)).paymentDetails.trim() !== "";
  const packages: LookupPackage[] = [];
  for (const [id, why] of chosen) {
    packages.push(await lookUpOne(tx, facts, today, now, id, why, agencyPaymentText));
  }
  return {
    packages,
    notRun: facts.notRun,
    customTrips: await aiCustomTripsOn(tx),
    today,
    travellers: facts.travellers,
    startsOn: facts.startsOn === null ? null : parseCalendarDate(facts.startsOn),
  };
}

async function lookUpOne(
  tx: OrgTx,
  facts: ChatFacts,
  today: CalendarDate,
  now: Date,
  id: string,
  why: PackageWhy,
  agencyPaymentText: boolean,
): Promise<LookupPackage> {
  const row = await tx.quoteTemplate.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      title: true,
      kind: true,
      nights: true,
      summary: true,
      highlights: true,
      inclusions: true,
      exclusions: true,
      days: true,
      startCity: true,
      pickupPoints: true,
      pricesIncludeGst: true,
      taxRateBasisPoints: true,
      roomTypes: true,
      advancePerPersonPaise: true,
      paymentDetails: true,
      fromPricePaise: true,
      destination: { select: { name: true } },
    },
  });
  const group = row.kind === "group";
  const offered = row.roomTypes as RoomType[];
  const details = group ? await openDepartureDetails(tx, id, today, now) : [];
  const seasons = group ? await seasonsOf(tx, id) : [];
  const departures = group ? await openDeparturesOf(tx, id, today, now, listFrom(facts, today)) : [];
  const onDay = facts.startsOn === null ? undefined : details.find((one) => one.startsOn === facts.startsOn);
  const settled = onDay ?? details.find((one) => one.id === facts.departureId);
  const chosenDeparture =
    settled === undefined ? null : { id: settled.id, startsOn: settled.startsOn, freeSeats: settled.freeSeats };
  // A group trip runs only on its departures: a date with none open is the team's to confirm, even inside a season.
  const priced =
    onDay === undefined || facts.startsOn === null
      ? null
      : priceOn(parseCalendarDate(facts.startsOn), seasons, { title: onDay.title, prices: onDay.prices }, offered);
  const prices = priced?.prices ?? null;
  const from = group
    ? fromPrices(
        seasons,
        details.map((one) => one.prices),
        today,
        offered,
      )
    : noPrices;
  const given = adultRoomTypes.flatMap((type) => (from[type] === null ? [] : [from[type]]));
  const fromPaise = group ? (given.length === 0 ? null : Math.min(...given)) : big(row.fromPricePaise);
  const files = await packageFilesIn(tx, id);
  const chatRooms = roomsFor(facts, offered);
  const asked = chatRooms.reduce((sum, room) => sum + room.people, 0);
  const rooms =
    prices !== null && facts.travellers !== null && asked === facts.travellers
      ? groupTotal(
          prices,
          chatRooms,
          {
            pricesIncludeGst: row.pricesIncludeGst,
            taxRateBasisPoints: quoteTaxRate.catch(500).parse(row.taxRateBasisPoints),
            supplierStateCode: ANY_STATE,
          },
          offered,
        )
      : null;
  const days = Array.isArray(row.days) ? (row.days as { title?: unknown }[]) : [];
  return {
    id,
    why,
    name: row.name,
    title: row.title,
    kind: group ? "group" : "custom",
    destination: row.destination?.name ?? null,
    nights: row.nights,
    summary: row.summary,
    highlights: Array.isArray(row.highlights)
      ? row.highlights.filter((one): one is string => typeof one === "string")
      : [],
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    dayTitles: days.flatMap((day) => (typeof day.title === "string" ? [day.title] : [])),
    startCity: row.startCity,
    pickupPoints: row.pickupPoints.trim(),
    pricesIncludeGst: row.pricesIncludeGst,
    offered,
    prices,
    from,
    fromPaise,
    departures,
    chosenDeparture,
    total: rooms?.ok === true && chatRooms.length > 0 ? rooms.totalPaise : null,
    advancePerPersonPaise: big(row.advancePerPersonPaise),
    hasPaymentQr: files.paymentQrId !== null,
    hasPaymentText: row.paymentDetails.trim() !== "" || agencyPaymentText,
    brochures: files.brochures.filter((one) => !facts.sentFileIds.includes(one.id)),
  };
}
