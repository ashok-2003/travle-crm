// The grounded turn's lookup: from what the chat settled, code reads the agency's packages, seasons and departures, so
// that no amount, date or seat count ever comes from a model.
import type { ChatFacts } from "@travel-crm/contracts/ai";
import { adultRoomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetails, type OpenDeparture } from "../../departures/index.js";
import { parseCalendarDate, type CalendarDate } from "../../kernel/index.js";
import { fromPrices, packageFilesIn, priceOn, sellablePackages, seasonsOf, totalFor } from "../../quotes/index.js";
import { autopilotOf } from "../autopilot.js";
import { aiCustomTripsOn } from "../settings.js";

export const MOST_PACKAGES = 5;

/** Why a package is in the lookup. */
export type PackageWhy = { kind: "chosen" } | { kind: "place"; words: string } | { kind: "nearest"; words: string[] };

export interface LookupPackage {
  id: string;
  why: PackageWhy;
  name: string;
  title: string;
  kind: "custom" | "group";
  destination: string | null;
  nights: number | null;
  summary: string;
  highlights: string[];
  inclusions: string;
  exclusions: string;
  dayTitles: string[];
  startCity: string;
  pickupPoints: string;
  pricesIncludeGst: boolean;
  offered: RoomType[];
  /** Per person by room type on the asked date; null when no date is asked or the date has no open departure or season. */
  prices: RoomPrices | null;
  /** The lowest coming price per room type (a group package only). */
  from: RoomPrices;
  /** The lowest per-person price: for a group package an adult's, for a custom one the figure staff entered. */
  fromPaise: number | null;
  /** The next open departures, at most three (none for a custom package). */
  departures: OpenDeparture[];
  /** The open departure on the asked date, or the one the chat settled on. */
  chosenDeparture: OpenDeparture | null;
  /** What the chat's rooms add up to on the asked date, only when every traveller has a priced room. */
  total: number | null;
  advancePerPersonPaise: number | null;
  hasPaymentQr: boolean;
  hasPaymentText: boolean;
  /** Brochures the chat has not been sent yet. */
  brochures: { id: string; fileName: string }[];
}

export interface Lookup {
  packages: LookupPackage[];
  notRun: string[];
  customTrips: boolean;
  today: CalendarDate;
  travellers: number | null;
  startsOn: CalendarDate | null;
}

const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};
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
  const departures = details
    .slice(0, 3)
    .map(({ id: departureId, startsOn, freeSeats }) => ({ id: departureId, startsOn, freeSeats }));
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
  const asked = facts.rooms.reduce((sum, room) => sum + room.people, 0);
  const rooms =
    prices !== null && facts.travellers !== null && asked === facts.travellers ? totalFor(prices, facts.rooms) : null;
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
    total: rooms?.ok === true && facts.rooms.length > 0 ? rooms.totalPaise : null,
    advancePerPersonPaise: big(row.advancePerPersonPaise),
    hasPaymentQr: files.paymentQrId !== null,
    hasPaymentText: row.paymentDetails.trim() !== "" || agencyPaymentText,
    brochures: files.brochures.filter((one) => !facts.sentFileIds.includes(one.id)),
  };
}
