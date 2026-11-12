// The lite agent's reads of one package: its details, its open dates and seats, its rooms and what it costs. Only saved data.
import { withoutAmountsAndDates, withoutPaymentDetails, type LiteFacts } from "@travel-crm/contracts/ai";
import { quoteTaxRate, adultRoomTypes, type RoomBooking, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetails } from "../../../departures/index.js";
import { addDays, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import { fromPrices, groupTotal, priceOn, seasonsOf } from "../../../quotes/index.js";
import type { DepartureLine, PackageDetails, PriceFacts } from "../types.js";

/** Only splits CGST/SGST from IGST, never the total, so the lookup (which has no GST state) may use any valid one. */
const ANY_STATE = "27";
const MOST_DEPARTURES = 3;
/** Also drops any word with an "@" in it: a short handle or an email is not for the customer from here. */
const clean = (text: string) =>
  withoutAmountsAndDates(withoutPaymentDetails(text))
    .replace(/\S*@\S*/gu, "")
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

/** The adults' room: the one they chose, else the only adult room the package sells; null while it is open. */
function adultsRoom(roomType: RoomType | null, offered: readonly RoomType[]): RoomType | null {
  if (roomType !== null) return roomType;
  const [only, ...others] = adultRoomsOf(offered);
  return only !== undefined && others.length === 0 ? only : null;
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

export async function priceOf(
  tx: OrgTx,
  packageId: string,
  facts: LiteFacts,
  today: CalendarDate,
  now: Date,
): Promise<PriceFacts> {
  const row = await tx.quoteTemplate.findUniqueOrThrow({
    where: { id: packageId },
    select: { roomTypes: true, pricesIncludeGst: true, taxRateBasisPoints: true, advancePerPersonPaise: true },
  });
  const offered = row.roomTypes as RoomType[];
  const open = await openDepartureDetails(tx, packageId, today, now);
  const seasons = await seasonsOf(tx, packageId);
  const from = fromPrices(
    seasons,
    open.map((one) => one.prices),
    today,
    offered,
  );
  const given = adultRoomTypes.flatMap((type) => (from[type] === null ? [] : [from[type]]));
  const fromPaise = given.length === 0 ? null : Math.min(...given);
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
