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

const openWhere = (today: CalendarDate, from: CalendarDate) => ({
  status: "open" as const,
  startDate: { gte: asDate(from) },
  OR: [{ cutoffOn: null }, { cutoffOn: { gte: asDate(today) } }],
});

type DepartureFound = Awaited<ReturnType<OrgTx["departure"]["findMany"]>>[number];

/** The rows that still have a free seat, each with its package, their seats worked out in one read for all of them. */
async function withFreeSeats(
  tx: OrgTx,
  rows: DepartureFound[],
  now: Date,
): Promise<{ templateId: string | null; detail: OpenDepartureDetail }[]> {
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
            templateId: row.templateId,
            detail: {
              id: row.id,
              startsOn: parseCalendarDate(dayOf(row.startDate)),
              freeSeats,
              title: row.title,
              prices: ownPricesOf(row),
            },
          },
        ]
      : [];
  });
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
    where: { templateId: packageId, ...openWhere(today, from) },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  return (await withFreeSeats(tx, rows, now)).map((one) => one.detail);
}

/**
 * The same for each of these packages, soonest first, in one read of the departures and one of their seats whatever the
 * number of packages (a package with none open has an empty list).
 */
export async function openDepartureDetailsByPackage(
  tx: OrgTx,
  packageIds: readonly string[],
  today: CalendarDate,
  now: Date,
): Promise<Map<string, OpenDepartureDetail[]>> {
  const found = new Map<string, OpenDepartureDetail[]>(packageIds.map((id) => [id, []]));
  if (packageIds.length === 0) return found;
  const rows = await tx.departure.findMany({
    where: { templateId: { in: [...packageIds] }, ...openWhere(today, today) },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  for (const { templateId, detail } of await withFreeSeats(tx, rows, now)) {
    if (templateId !== null) found.get(templateId)?.push(detail);
  }
  return found;
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
