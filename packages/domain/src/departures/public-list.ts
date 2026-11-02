// The departures a public package page lists (release 7b): upcoming, not cancelled or closed, past no cut-off, at the package's
// destination, each with a word (Open, Filling fast, Full) and never a seat count. Also the one departure a visitor may join.
import type { PublicSeatWord } from "@travel-crm/contracts/package-pages";
import type { OrgTx } from "@travel-crm/db";
import { asDate, countsOf, dayOf, departureSettingsOf, seatsSoldAndHeld, stateOf } from "./rows.js";

export interface PublicDepartureRow {
  id: string;
  destinationId: string | null;
  title: string;
  startDate: string;
  endDate: string;
  word: PublicSeatWord;
  pricePaise: number | null;
}

const MOST_LISTED = 12;

/** The words a visitor reads; staff seat counts stay with staff. */
const wordOf = (state: string): PublicSeatWord | null =>
  state === "open" || state === "filling" || state === "full" ? state : null;

/** Upcoming departures at a destination that still take seats or a waitlist, the next first. */
export async function publicDepartures(
  tx: OrgTx,
  input: { destinationId: string | null; today: string; now: Date; onlyId?: string },
): Promise<PublicDepartureRow[]> {
  if (input.destinationId === null && input.onlyId === undefined) return [];
  const rows = await tx.departure.findMany({
    where: {
      status: "open",
      startDate: { gte: asDate(input.today) },
      OR: [{ cutoffOn: null }, { cutoffOn: { gte: asDate(input.today) } }],
      ...(input.onlyId === undefined ? { destinationId: input.destinationId } : { id: input.onlyId }),
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    take: MOST_LISTED,
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      seatsTotal: true,
      pricePaise: true,
      status: true,
      destinationId: true,
    },
  });
  const [seats, settings] = await Promise.all([
    seatsSoldAndHeld(
      tx,
      rows.map((row) => row.id),
      input.now,
    ),
    departureSettingsOf(tx),
  ]);
  return rows.flatMap((row) => {
    const counts = countsOf(row.seatsTotal, seats.get(row.id)?.sold ?? 0, seats.get(row.id)?.held ?? 0);
    const word = wordOf(stateOf(row, counts, settings.fillingFastPercent));
    return word === null
      ? []
      : [
          {
            id: row.id,
            destinationId: row.destinationId,
            title: row.title,
            startDate: dayOf(row.startDate),
            endDate: dayOf(row.endDate),
            word,
            pricePaise: row.pricePaise === null ? null : Number(row.pricePaise),
          },
        ];
  });
}
