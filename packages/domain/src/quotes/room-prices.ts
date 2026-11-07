// Which room prices apply on a date, what a group's rooms add up to, and the pre-tax part of a price that includes GST.
import {
  roomCapacity,
  roomTypes,
  type RoomBooking,
  type RoomPrices,
  type RoomType,
} from "@travel-crm/contracts/quotes";
import type { CalendarDate } from "../kernel/index.js";

export interface SeasonPrices {
  label: string;
  startsOn: CalendarDate;
  endsOn: CalendarDate;
  prices: RoomPrices;
}

export interface PricedDate {
  prices: RoomPrices;
  source: "departure" | "season";
  label: string;
}

/** Only the offered room types keep a price. */
function offeredOnly(prices: RoomPrices, offered: readonly RoomType[]): RoomPrices {
  const kept = { ...prices };
  for (const type of roomTypes) if (!offered.includes(type)) kept[type] = null;
  return kept;
}

/**
 * The prices for a date. A departure that sets any price brings its own whole set (a premium batch never borrows the
 * season's); otherwise the season covering the date, both ends included.
 */
export function priceOn(
  date: CalendarDate,
  seasons: readonly SeasonPrices[],
  departure: { title: string; prices: RoomPrices } | null,
  offered: readonly RoomType[],
): PricedDate | null {
  if (departure && roomTypes.some((type) => departure.prices[type] !== null)) {
    return { prices: offeredOnly(departure.prices, offered), source: "departure", label: departure.title };
  }
  const season = seasons.find((candidate) => candidate.startsOn <= date && date <= candidate.endsOn);
  if (!season) return null;
  return { prices: offeredOnly(season.prices, offered), source: "season", label: season.label };
}

/**
 * The lowest price per offered room type that is still to come: over the seasons that have not ended and the open
 * departures' own prices. A room type nothing prices stays null.
 */
export function fromPrices(
  seasons: readonly SeasonPrices[],
  departures: readonly RoomPrices[],
  today: CalendarDate,
  offered: readonly RoomType[],
): RoomPrices {
  const sets = [...seasons.filter((season) => season.endsOn >= today).map((season) => season.prices), ...departures];
  const lowest = { ...emptyPrices };
  for (const type of roomTypes) {
    const given = offered.includes(type) ? sets.flatMap((set) => (set[type] === null ? [] : [set[type]])) : [];
    lowest[type] = given.length === 0 ? null : Math.min(...given);
  }
  return lowest;
}

const emptyPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};

export interface RoomLine {
  roomType: RoomType;
  people: number;
  pricePaise: number;
  amountPaise: number;
}

export type RoomTotal =
  | { ok: true; totalPaise: number; lines: RoomLine[] }
  | { ok: false; reason: "NO_PRICE" | "ROOM_SPLIT"; roomType: RoomType };

/** What the rooms cost: people times the room type's price, refused when no price is set or the people don't fill rooms. */
export function totalFor(prices: RoomPrices, rooms: readonly RoomBooking[]): RoomTotal {
  const lines: RoomLine[] = [];
  for (const { roomType, people } of rooms) {
    const pricePaise = prices[roomType];
    if (pricePaise === null) return { ok: false, reason: "NO_PRICE", roomType };
    const capacity = roomCapacity[roomType];
    if (capacity !== null && people % capacity !== 0) return { ok: false, reason: "ROOM_SPLIT", roomType };
    lines.push({ roomType, people, pricePaise, amountPaise: pricePaise * people });
  }
  return { ok: true, totalPaise: lines.reduce((sum, line) => sum + line.amountPaise, 0), lines };
}

const MAX_GST_ROUNDING_GAP_PAISE = 2;

/**
 * The pre-tax subtotal of a price that includes GST: the one whose subtotal plus tax is the total, searched around
 * total ÷ (1 + rate). Rounding can leave no such subtotal; then the one whose sum is closest to the total without going
 * above it wins (a customer is never quoted more than they were told), never more than 2 paise away.
 */
export function exTaxSubtotal(
  totalPaise: number,
  rateBasisPoints: number,
  taxOf: (subtotalPaise: number) => number,
): number {
  const estimate = Math.round((totalPaise * 10_000) / (10_000 + rateBasisPoints));
  let best: number | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
    const candidate = estimate + offset;
    const sum = candidate + taxOf(candidate);
    const gap = totalPaise - sum;
    if (gap >= 0 && gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  // A programming error, not a business refusal: a tax function that can't come near the total is wrong.
  if (best === null || bestGap > MAX_GST_ROUNDING_GAP_PAISE) {
    throw new Error(
      `No subtotal within ${String(MAX_GST_ROUNDING_GAP_PAISE)} paise below the total ${String(totalPaise)}`,
    );
  }
  return best;
}
