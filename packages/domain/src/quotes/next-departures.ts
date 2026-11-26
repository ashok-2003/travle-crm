// The next departure of each group trip for the packages list: its first one from today that is not cancelled, with the
// seats free as the departures calendar counts them. Read in a fixed three queries whatever the number of trips.
// Seats are counted by seat-counts.ts, the same code the departures calendar uses.
import type { OrgTx } from "@travel-crm/db";
import { countsOf, seatsSoldAndHeld } from "./seat-counts.js";
import { parseCalendarDate, type CalendarDate } from "../kernel/index.js";

export interface NextDeparture {
  startDate: CalendarDate;
  seatsFree: number;
}

/** Each of these trips with its next departure, or null when it has none ahead. */
export async function nextDepartures(
  tx: OrgTx,
  packageIds: readonly string[],
  today: CalendarDate,
  now: Date = new Date(),
): Promise<Map<string, NextDeparture | null>> {
  const found = new Map<string, NextDeparture | null>(packageIds.map((id) => [id, null]));
  if (packageIds.length === 0) return found;
  const firsts = await tx.departure.findMany({
    where: {
      templateId: { in: [...packageIds] },
      status: { not: "cancelled" },
      startDate: { gte: new Date(`${today}T00:00:00Z`) },
    },
    distinct: ["templateId"],
    orderBy: [{ templateId: "asc" }, { startDate: "asc" }, { id: "asc" }],
    select: { id: true, templateId: true, startDate: true, seatsTotal: true },
  });
  if (firsts.length === 0) return found;
  const ids = firsts.map((row) => row.id);
  const seats = await seatsSoldAndHeld(tx, ids, now);
  for (const row of firsts) {
    if (row.templateId === null) continue;
    found.set(row.templateId, {
      startDate: parseCalendarDate(row.startDate.toISOString().slice(0, 10)),
      seatsFree: countsOf(row.seatsTotal, seats.get(row.id)?.sold ?? 0, seats.get(row.id)?.held ?? 0).free,
    });
  }
  return found;
}
