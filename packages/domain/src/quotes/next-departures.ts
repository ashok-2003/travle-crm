// The next departure of each group trip for the packages list: its first one from today that is not cancelled, with the
// seats free as the departures calendar counts them. Read in a fixed three queries whatever the number of trips.
// (Quotes cannot call the departures module, which calls quotes, so the seat counting is repeated here from its tables.)
import type { OrgTx } from "@travel-crm/db";
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
  const [sold, held] = await Promise.all([
    tx.$queryRaw<{ departure_id: string; heads: number }[]>`
      SELECT b.departure_id, COALESCE(SUM(q.adults + q.children), 0)::int AS heads
      FROM booking b JOIN quote q ON q.id = b.quote_id
      WHERE b.departure_id = ANY(${ids}::uuid[]) AND b.deleted_at IS NULL AND b.status IN ('requested', 'confirmed')
      GROUP BY b.departure_id`,
    tx.$queryRaw<{ departure_id: string; seats: number }[]>`
      SELECT departure_id, COALESCE(SUM(seats), 0)::int AS seats
      FROM departure_hold
      WHERE departure_id = ANY(${ids}::uuid[]) AND status = 'active' AND expires_at > ${now}
      GROUP BY departure_id`,
  ]);
  const soldOn = new Map(sold.map((row) => [row.departure_id, row.heads]));
  const heldOn = new Map(held.map((row) => [row.departure_id, row.seats]));
  for (const row of firsts) {
    if (row.templateId === null) continue;
    found.set(row.templateId, {
      startDate: parseCalendarDate(row.startDate.toISOString().slice(0, 10)),
      seatsFree: Math.max(0, row.seatsTotal - (soldOn.get(row.id) ?? 0) - (heldOn.get(row.id) ?? 0)),
    });
  }
  return found;
}
