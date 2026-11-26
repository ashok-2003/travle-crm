// How a departure is read for the rest of the module: the row locked for a change, its settings, and its seats. Seats are
// worked out here and nowhere else: sold is the heads of the live Requested and Confirmed bookings on it, held is the active
// holds not yet past their time, free is what is left. Nothing counts seats in a column.
import type { SeatCounts, SeatState } from "@travel-crm/contracts/departures";
import { adultRoomTypes, roomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { countsOf, departurePriceColumn, seatsSoldAndHeld } from "../quotes/index.js";

export { countsOf, seatsSoldAndHeld };

/** A day stored as a Date (Postgres date) as YYYY-MM-DD. */
export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
/** A day as the product shows one in words: "3 Nov". */
export const dayWords = (day: Date): string => dayFormat.format(day);
export const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);

export const departureColumns = {
  id: true,
  title: true,
  destinationId: true,
  startDate: true,
  endDate: true,
  seatsTotal: true,
  pricePaise: true,
  cutoffOn: true,
  status: true,
  notes: true,
  cancelledReason: true,
  templateId: true,
  priceSinglePaise: true,
  priceDoublePaise: true,
  priceTriplePaise: true,
  priceQuadPaise: true,
  priceChildBedPaise: true,
  priceChildNoBedPaise: true,
  destination: { select: { name: true } },
} as const;

/** A departure's own prices as the contract reads them. */
export function ownPricesOf(row: Partial<Record<(typeof departurePriceColumn)[RoomType], bigint | null>>): RoomPrices {
  const read = (type: RoomType) => {
    const value = row[departurePriceColumn[type]];
    return value == null ? null : Number(value);
  };
  return Object.fromEntries(roomTypes.map((type) => [type, read(type)])) as unknown as RoomPrices;
}

/**
 * The columns that hold these prices, and the lowest adult price among them (the per-person figure the lists show), if any.
 * A child's price is a discount on a place beside an adult's, so it is never "the" price.
 */
export function priceColumnsOf(prices: RoomPrices) {
  const columns = Object.fromEntries(
    roomTypes.map((type) => [departurePriceColumn[type], prices[type] === null ? null : BigInt(prices[type])]),
  ) as Record<(typeof departurePriceColumn)[RoomType], bigint | null>;
  const given = adultRoomTypes.flatMap((type) => (prices[type] === null ? [] : [prices[type]]));
  return { columns, lowest: given.length === 0 ? null : BigInt(Math.min(...given)) };
}

export type DepartureRow = NonNullable<Awaited<ReturnType<typeof readDeparture>>>;

const readDeparture = (tx: OrgTx, departureId: string) =>
  tx.departure.findUnique({ where: { id: departureId }, select: departureColumns });

export async function findDeparture(tx: OrgTx, departureId: string): Promise<DepartureRow> {
  const row = await readDeparture(tx, departureId);
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such departure");
  return row;
}

/**
 * The same, with the departure's row locked until the transaction ends: two people holding the last seats, or a booking
 * made while a hold is taken, wait their turn, and the second sees what the first did.
 */
export async function findDepartureForChange(tx: OrgTx, departureId: string): Promise<DepartureRow> {
  await tx.$queryRaw`SELECT id FROM departure WHERE id = ${departureId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  return findDeparture(tx, departureId);
}

/** A departure that can still take seats: open, and not cancelled or closed. */
export function assertOpenForSeats(departure: Pick<DepartureRow, "status">): void {
  if (departure.status !== "open") {
    throw new DomainError("CONFLICT", "DEPARTURE_NOT_OPEN", "This departure is closed or cancelled");
  }
}

export interface DepartureSettingsRow {
  holdHours: number;
  fillingFastPercent: number;
  defaultRoomCapacity: number;
  /** Whether an AI-written message about empty seats may say how many are left. */
  shareSeatCounts: boolean;
}

export const defaultDepartureSettings: DepartureSettingsRow = {
  holdHours: 48,
  fillingFastPercent: 20,
  defaultRoomCapacity: 2,
  shareSeatCounts: false,
};

export async function departureSettingsOf(tx: OrgTx): Promise<DepartureSettingsRow> {
  const row = await tx.departureSettings.findFirst({
    select: { holdHours: true, fillingFastPercent: true, defaultRoomCapacity: true, shareSeatCounts: true },
  });
  return row ?? defaultDepartureSettings;
}

/** Open, Filling fast (the free seats are the agency's percent of the total or fewer), Full, Closed, Cancelled. */
export function stateOf(
  departure: Pick<DepartureRow, "status">,
  counts: Pick<SeatCounts, "seatsTotal" | "free">,
  fillingFastPercent: number,
): SeatState {
  if (departure.status === "cancelled") return "cancelled";
  if (departure.status === "closed") return "closed";
  if (counts.free <= 0) return "full";
  return counts.free * 100 <= counts.seatsTotal * fillingFastPercent ? "filling" : "open";
}

/** The seats free on one departure right now, for a change that needs room. */
export async function freeSeats(
  tx: OrgTx,
  departure: Pick<DepartureRow, "id" | "seatsTotal">,
  now: Date,
): Promise<number> {
  const found = (await seatsSoldAndHeld(tx, [departure.id], now)).get(departure.id) ?? { sold: 0, held: 0 };
  return countsOf(departure.seatsTotal, found.sold, found.held).free;
}
