// The lite agent's reads of one package: its details, its open dates and seats, its rooms and what it costs. Only saved data.
import { withoutAmountsAndDates, withoutPaymentDetails, type LiteFacts } from "@travel-crm/contracts/ai";
import {
  quoteTaxRate,
  adultRoomTypes,
  type RoomBooking,
  type RoomPrices,
  type RoomType,
} from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetails } from "../../../departures/index.js";
import { addDays, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import { fromPrices, groupTotal, priceOn, seasonsOf } from "../../../quotes/index.js";
import type { DepartureLine, PackageDetails, PriceFacts } from "../types.js";

/** Only splits CGST/SGST from IGST, never the total, so the lookup (which has no GST state) may use any valid one. */
const ANY_STATE = "27";
const MOST_DEPARTURES = 3;
/** Also drops an email ("x@y") and a handle ("@sharmatrips"); an "@" standing alone ("Gate @ ISBT") stays. */
const clean = (text: string) =>
  withoutAmountsAndDates(withoutPaymentDetails(text))
    .replace(/\S+@\S+|(?<!\S)@[\p{L}\p{N}_.]+/gu, "")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

/** What the customer may be told about a package, with every typed amount, date and payment detail taken out. */
export async function packageDetails(tx: OrgTx, packageId: string): Promise<PackageDetails | null> {
  const row = await tx.quoteTemplate.findUnique({
    where: { id: packageId },
    select: {
      title: true,
      nights: true,
      startCity: true,
      pickupPoints: true,
      days: true,
      highlights: true,
      inclusions: true,
      exclusions: true,
      notes: true,
      cancellationNotes: true,
      destination: { select: { name: true } },
    },
  });
  if (row === null) return null;
  const days = Array.isArray(row.days) ? (row.days as { title?: unknown }[]) : [];
  return {
    packageId,
    title: row.title,
    place: row.destination?.name ?? null,
    nights: row.nights,
    startCity: row.startCity,
    pickups: pickupsOf(row.pickupPoints),
    days: days.flatMap((day) => (typeof day.title === "string" ? [day.title.slice(0, 80)] : [])).slice(0, 12),
    highlights: strings(row.highlights).slice(0, 6),
    inclusions: clean(row.inclusions).slice(0, 600),
    exclusions: clean(row.exclusions).slice(0, 400),
    notes: clean(row.notes).slice(0, 400),
    cancellation: clean(row.cancellationNotes).slice(0, 400),
  };
}

export function pickupsOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().slice(0, 80))
    .filter((line) => line !== "")
    .slice(0, 6);
}

/** The package's open departures with `seats` free: from the month asked (never before tomorrow), else from tomorrow. */
export async function datesAndSeats(
  tx: OrgTx,
  packageId: string,
  ask: { month: string | null; seats: number; today: CalendarDate; now: Date },
): Promise<DepartureLine[]> {
  const tomorrow = addDays(ask.today, 1);
  const monthStart = ask.month === null ? null : parseCalendarDate(`${ask.month}-01`);
  const from = monthStart !== null && monthStart > tomorrow ? monthStart : tomorrow;
  const open = await openDepartureDetails(tx, packageId, ask.today, ask.now, from);
  return open
    .filter((one) => (ask.month === null || one.startsOn.startsWith(ask.month)) && one.freeSeats >= ask.seats)
    .slice(0, MOST_DEPARTURES)
    .map((one) => ({ id: one.id, startsOn: one.startsOn, freeSeats: one.freeSeats }));
}

const adultRoomsOf = (offered: readonly RoomType[]): RoomType[] =>
  adultRoomTypes.filter((type) => offered.includes(type));

/**
 * The adults' room: the only adult room the package sells, whatever room they said (a triple-only trek has nothing else
 * to give "2 sharing"); else the one they chose; null while it is open.
 */
function adultsRoom(roomType: RoomType | null, offered: readonly RoomType[]): RoomType | null {
  const [only, ...others] = adultRoomsOf(offered);
  if (only !== undefined && others.length === 0) return only;
  return roomType;
}

/** The rooms the party takes. A child takes a child bed if offered, else no bed, else shares the adults' room. */
export function liteRooms(
  facts: Pick<LiteFacts, "adults" | "children" | "roomType">,
  offered: RoomType[],
): RoomBooking[] {
  const room = adultsRoom(facts.roomType, offered);
  if (facts.adults === null || room === null) return [];
  const children = facts.children?.count ?? 0;
  const childRoom = offered.includes("child_bed")
    ? "child_bed"
    : offered.includes("child_no_bed")
      ? "child_no_bed"
      : room;
  const rooms: RoomBooking[] = [{ roomType: room, people: facts.adults + (childRoom === room ? children : 0) }];
  if (children > 0 && childRoom !== room) rooms.push({ roomType: childRoom, people: children });
  return rooms;
}

/** The lowest adult price per person still to come, over the seasons not yet ended and the open departures' own prices. */
export function lowestAdultPrice(
  seasons: Parameters<typeof fromPrices>[0],
  open: readonly { prices: RoomPrices }[],
  today: CalendarDate,
  offered: readonly RoomType[],
): number | null {
  const from = fromPrices(
    seasons,
    open.map((one) => one.prices),
    today,
    offered,
  );
  const given = adultRoomTypes.flatMap((type) => (from[type] === null ? [] : [from[type]]));
  return given.length === 0 ? null : Math.min(...given);
}

/** What the package costs for the facts; null for a package gone since the turn read the index (deleted mid-turn). */
export async function priceOf(
  tx: OrgTx,
  packageId: string,
  facts: LiteFacts,
  today: CalendarDate,
  now: Date,
): Promise<PriceFacts | null> {
  const row = await tx.quoteTemplate.findUnique({
    where: { id: packageId },
    select: { roomTypes: true, pricesIncludeGst: true, taxRateBasisPoints: true, advancePerPersonPaise: true },
  });
  if (row === null) return null;
  const offered = row.roomTypes as RoomType[];
  const open = await openDepartureDetails(tx, packageId, today, now);
  const seasons = await seasonsOf(tx, packageId);
  const fromPaise = lowestAdultPrice(seasons, open, today, offered);
  const advancePerPersonPaise = Number(row.advancePerPersonPaise);
  const chosen = open.find((one) => one.id === facts.departureId) ?? null;
  const room = adultsRoom(facts.roomType, offered);
  const prices =
    chosen === null
      ? null
      : (priceOn(chosen.startsOn, seasons, { title: chosen.title, prices: chosen.prices }, offered)?.prices ?? null);
  const rooms = liteRooms(facts, offered);
  const travellers = facts.adults === null ? null : facts.adults + (facts.children?.count ?? 0);
  const onDeparture = room === null || prices === null ? null : prices[room];
  const perPersonPaise = onDeparture ?? fromPaise;
  const total =
    prices === null || rooms.length === 0
      ? null
      : groupTotal(
          prices,
          rooms,
          {
            pricesIncludeGst: row.pricesIncludeGst,
            taxRateBasisPoints: quoteTaxRate.catch(500).parse(row.taxRateBasisPoints),
            supplierStateCode: ANY_STATE,
          },
          offered,
        );
  const totalPaise = total?.ok === true ? total.totalPaise : null;
  return {
    packageId,
    roomType: room,
    fromPaise,
    perPersonPaise,
    totalPaise,
    advancePaise: totalPaise === null || travellers === null ? null : advancePerPersonPaise * travellers,
    advancePerPersonPaise,
    rooms,
    travellers,
    departure: chosen === null ? null : { id: chosen.id, startsOn: chosen.startsOn, freeSeats: chosen.freeSeats },
  };
}
