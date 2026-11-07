// The departures of a group package a customer may still be offered: open, past no cut-off, with a free seat.
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { parseCalendarDate, type CalendarDate } from "../kernel/index.js";
import { asDate, countsOf, dayOf, ownPricesOf, seatsSoldAndHeld } from "./rows.js";

const MOST_OFFERED = 3;

export interface OpenDeparture {
  id: string;
  startsOn: CalendarDate;
  freeSeats: number;
}

/** An open departure with what pricing a date needs: its title and its own prices. */
export interface OpenDepartureDetail extends OpenDeparture {
  title: string;
  prices: RoomPrices;
}

/** Every such departure of the package, soonest first. */
export async function openDepartureDetails(
  tx: OrgTx,
  packageId: string,
  today: CalendarDate,
  now: Date,
  from: CalendarDate = today,
): Promise<OpenDepartureDetail[]> {
  const rows = await tx.departure.findMany({
    where: {
      templateId: packageId,
      status: "open",
      startDate: { gte: asDate(from) },
      OR: [{ cutoffOn: null }, { cutoffOn: { gte: asDate(today) } }],
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  const seats = await seatsSoldAndHeld(
    tx,
    rows.map((row) => row.id),
    now,
  );
  return rows.flatMap((row) => {
    const found = seats.get(row.id) ?? { sold: 0, held: 0 };
    const freeSeats = countsOf(row.seatsTotal, found.sold, found.held).free;
    return freeSeats > 0
      ? [
          {
            id: row.id,
            startsOn: parseCalendarDate(dayOf(row.startDate)),
            freeSeats,
            title: row.title,
            prices: ownPricesOf(row),
          },
        ]
      : [];
  });
}

/** The next three open departures with free seats on or after `from` (today by default), soonest first. */
export async function openDeparturesOf(
  tx: OrgTx,
  packageId: string,
  today: CalendarDate,
  now: Date,
  from: CalendarDate = today,
): Promise<OpenDeparture[]> {
  const details = await openDepartureDetails(tx, packageId, today, now, from);
  return details.slice(0, MOST_OFFERED).map(({ id, startsOn, freeSeats }) => ({ id, startsOn, freeSeats }));
}
