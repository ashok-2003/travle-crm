// Every departure of these trips still on sale, by the trip sheet's rule (open, a free seat, leaving after today), each
// with its prices on the day by `priceOn`, the quote's rule: for quote and a month's lookup, which read past the 8 dates
// a sheet lists. A fixed handful of reads, whatever the number of trips.
import { adultRoomTypes, roomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { openDepartureDetailsByPackage } from "../../../departures/index.js";
import type { CalendarDate } from "../../../kernel/index.js";
import { priceOn, seasonsByPackage } from "../../../quotes/index.js";

export interface DateOnSale {
  id: string;
  startsOn: CalendarDate;
  freeSeats: number;
  /** The prices on its day; null when no adult room has one. */
  prices: RoomPrices | null;
}

/** Each trip's room types and its departures on sale, soonest first. */
export async function datesOnSale(
  tx: OrgTx,
  packageIds: readonly string[],
  today: CalendarDate,
  now: Date,
): Promise<Map<string, { offered: RoomType[]; dates: DateOnSale[] }>> {
  const [rows, departures, seasons] = await Promise.all([
    tx.quoteTemplate.findMany({ where: { id: { in: [...packageIds] } }, select: { id: true, roomTypes: true } }),
    openDepartureDetailsByPackage(tx, packageIds, today, now),
    seasonsByPackage(tx, packageIds),
  ]);
  return new Map(
    rows.map((row) => {
      const offered = roomTypes.filter((type) => row.roomTypes.includes(type));
      const ownSeasons = seasons.get(row.id) ?? [];
      const dates = (departures.get(row.id) ?? [])
        .filter((one) => one.startsOn > today)
        .map(({ id, startsOn, freeSeats, title, prices: own }) => {
          const prices = priceOn(startsOn, ownSeasons, { title, prices: own }, offered)?.prices ?? null;
          const priced = prices !== null && adultRoomTypes.some((type) => prices[type] !== null);
          return { id, startsOn, freeSeats, prices: priced ? prices : null };
        });
      return [row.id, { offered, dates }];
    }),
  );
}
