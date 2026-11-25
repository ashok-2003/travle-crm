// A trip's departures for its calendar: each with the seats left and the price that applies on its first day.
import { roomTypes, type RoomPrices } from "@travel-crm/contracts/quotes";
import {
  calendarDeparture,
  type CalendarDeparture,
  type DepartureCalendarInput,
} from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { findPackage, priceOn, seasonsOf } from "../quotes/index.js";
import { parseCalendarDate } from "../kernel/index.js";
import { asDate, countsOf, dayOf, ownPricesOf, seatsSoldAndHeld } from "./rows.js";

const noPrices = (): RoomPrices => ({
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
});

/** The trip's departures starting in the range, cancelled ones too (the calendar shows them struck), earliest first. */
export async function packageCalendar(
  tx: OrgTx,
  input: DepartureCalendarInput,
  now: Date = new Date(),
): Promise<CalendarDeparture[]> {
  const pack = await findPackage(tx, input.packageId);
  const [rows, seasons] = await Promise.all([
    tx.departure.findMany({
      where: { templateId: pack.id, startDate: { gte: asDate(input.from), lte: asDate(input.to) } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        status: true,
        seatsTotal: true,
        priceSinglePaise: true,
        priceDoublePaise: true,
        priceTriplePaise: true,
        priceQuadPaise: true,
        priceChildBedPaise: true,
        priceChildNoBedPaise: true,
      },
    }),
    seasonsOf(tx, pack.id),
  ]);
  const seats = await seatsSoldAndHeld(
    tx,
    rows.map((row) => row.id),
    now,
  );
  const offered = roomTypes.filter((type) => pack.roomTypes.includes(type));
  return rows.map((row) => {
    const startDate = dayOf(row.startDate);
    const own = ownPricesOf(row);
    const priced = priceOn(parseCalendarDate(startDate), seasons, { title: row.title, prices: own }, offered);
    const counts = countsOf(row.seatsTotal, seats.get(row.id)?.sold ?? 0, seats.get(row.id)?.held ?? 0);
    return calendarDeparture.parse({
      departureId: row.id,
      startDate,
      endDate: dayOf(row.endDate),
      status: row.status,
      seatsTotal: counts.seatsTotal,
      seatsSold: counts.sold,
      seatsHeld: counts.held,
      seatsFree: counts.free,
      prices: priced?.prices ?? noPrices(),
      ownPrices: own,
      priceSource: priced?.source ?? "none",
      seasonLabel: priceOn(parseCalendarDate(startDate), seasons, null, offered)?.label ?? null,
    });
  });
}
