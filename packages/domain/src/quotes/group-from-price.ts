// The "From" price of group trips, worked out the way a quote prices a date: the lowest adult room price over the open
// departures still ahead, each through `priceOn`. Read in a fixed three queries whatever the number of trips.
import { adultRoomTypes, roomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { parseCalendarDate, type CalendarDate } from "../kernel/index.js";
import { seasonsByPackage } from "./package-seasons.js";
import { departurePriceColumn } from "./package-sell-gaps.js";
import { priceOn } from "./room-prices.js";

const asDay = (day: CalendarDate) => new Date(`${day}T00:00:00Z`);
const own = (value: bigint | null) => (value === null ? null : Number(value));

/** Each of these group packages with the lowest adult room price on its open departures ahead, or null when none has one. */
export async function groupFromPrices(
  tx: OrgTx,
  packageIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, number | null>> {
  const found = new Map<string, number | null>(packageIds.map((id) => [id, null]));
  if (packageIds.length === 0) return found;
  const ids = [...packageIds];
  const [packages, seasons, departures] = await Promise.all([
    tx.quoteTemplate.findMany({ where: { id: { in: ids } }, select: { id: true, roomTypes: true } }),
    seasonsByPackage(tx, ids),
    tx.departure.findMany({
      where: {
        templateId: { in: ids },
        status: "open",
        startDate: { gte: asDay(today) },
        OR: [{ cutoffOn: null }, { cutoffOn: { gte: asDay(today) } }],
      },
      select: {
        templateId: true,
        title: true,
        startDate: true,
        priceSinglePaise: true,
        priceDoublePaise: true,
        priceTriplePaise: true,
        priceQuadPaise: true,
        priceChildBedPaise: true,
        priceChildNoBedPaise: true,
      },
    }),
  ]);
  const offeredBy = new Map(packages.map((row) => [row.id, row.roomTypes as RoomType[]]));
  for (const row of departures) {
    if (row.templateId === null) continue;
    const prices = Object.fromEntries(
      roomTypes.map((type) => [type, own(row[departurePriceColumn[type]])]),
    ) as RoomPrices;
    const priced = priceOn(
      parseCalendarDate(row.startDate.toISOString().slice(0, 10)),
      seasons.get(row.templateId) ?? [],
      { title: row.title, prices },
      offeredBy.get(row.templateId) ?? [],
    );
    for (const type of adultRoomTypes) {
      const price = priced?.prices[type] ?? null;
      const lowest = found.get(row.templateId) ?? null;
      if (price !== null && (lowest === null || price < lowest)) found.set(row.templateId, price);
    }
  }
  return found;
}
