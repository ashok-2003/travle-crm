// How many seats of a departure are taken: the heads on its live bookings, the seats on its active holds, and the free
// seats left. The one place this is counted, so the packages list, the departures calendar and the AI never disagree.
// It lives in quotes, below departures, because departures already calls quotes and the packages list needs it too.
import type { SeatCounts } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";

/** The heads sold and held on each of these departures (zero for one with none). */
export async function seatsSoldAndHeld(
  tx: OrgTx,
  departureIds: readonly string[],
  now: Date,
): Promise<Map<string, { sold: number; held: number }>> {
  const ids = [...departureIds];
  const found = new Map(ids.map((id) => [id, { sold: 0, held: 0 }]));
  if (ids.length === 0) return found;
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
  for (const row of sold) {
    const entry = found.get(row.departure_id);
    if (entry) entry.sold = row.heads;
  }
  for (const row of held) {
    const entry = found.get(row.departure_id);
    if (entry) entry.held = row.seats;
  }
  return found;
}

export function countsOf(seatsTotal: number, sold: number, held: number): SeatCounts {
  return {
    seatsTotal,
    sold,
    held,
    free: Math.max(0, seatsTotal - sold - held),
    overbookedBy: Math.max(0, sold - seatsTotal),
  };
}
