// What Today shows about departures (release 7a): the batches starting within two weeks, one line each with seats sold and
// what needs a look first: holds ending within four hours, travellers' details incomplete, the rooms not drafted (within a
// week of leaving), or overbooked. Plain queries for anyone with departures:view; the router, not the person, decides who.
import { HOLD_ENDING_SOON_HOURS } from "@travel-crm/contracts/departures";
import type { DepartureReason } from "@travel-crm/contracts/today";
import type { OrgTx } from "@travel-crm/db";
import { addDays, type CalendarDate } from "../kernel/index.js";
import { asDate, countsOf, dayOf, seatsSoldAndHeld } from "./rows.js";

/** How far ahead a departure is on Today, and how near it must be before the rooming list is chased. */
export const DEPARTURES_HORIZON_DAYS = 14;
export const ROOMING_HORIZON_DAYS = 7;
const MOST_READ = 200;

export interface DepartureSoon {
  departureId: string;
  title: string;
  startDate: CalendarDate;
  sold: number;
  seatsTotal: number;
  reasons: DepartureReason[];
}

export async function departuresStartingSoon(tx: OrgTx, today: CalendarDate, now: Date): Promise<DepartureSoon[]> {
  const departures = await tx.departure.findMany({
    where: {
      status: { not: "cancelled" },
      startDate: { gte: asDate(today), lte: asDate(addDays(today, DEPARTURES_HORIZON_DAYS)) },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    take: MOST_READ,
    select: { id: true, title: true, startDate: true, seatsTotal: true },
  });
  if (departures.length === 0) return [];
  const ids = departures.map((departure) => departure.id);
  const soonEnough = new Date(now.getTime() + HOLD_ENDING_SOON_HOURS * 60 * 60 * 1000);
  const [seats, ending, incomplete, placed] = await Promise.all([
    seatsSoldAndHeld(tx, ids, now),
    tx.departureHold.findMany({
      where: { departureId: { in: ids }, status: "active", expiresAt: { gt: now, lte: soonEnough } },
      distinct: ["departureId"],
      select: { departureId: true },
    }),
    tx.booking.findMany({
      where: {
        departureId: { in: ids },
        status: { in: ["requested", "confirmed"] },
        travellers: { some: { completeAt: null } },
      },
      select: { departureId: true },
    }),
    tx.departureRoomAssignment.findMany({
      where: { stay: { departureId: { in: ids } } },
      distinct: ["stayId"],
      select: { stay: { select: { departureId: true } } },
    }),
  ]);
  const endingIds = new Set(ending.map((hold) => hold.departureId));
  const incompleteIds = new Set(incomplete.map((booking) => booking.departureId));
  const placedIds = new Set(placed.map((assignment) => assignment.stay.departureId));
  const roomingFrom = asDate(addDays(today, ROOMING_HORIZON_DAYS));
  return departures.map((departure) => {
    const found = seats.get(departure.id) ?? { sold: 0, held: 0 };
    const counts = countsOf(departure.seatsTotal, found.sold, found.held);
    const reasons: DepartureReason[] = [];
    if (endingIds.has(departure.id)) reasons.push("holds-ending");
    if (incompleteIds.has(departure.id)) reasons.push("details-incomplete");
    if (departure.startDate <= roomingFrom && found.sold > 0 && !placedIds.has(departure.id)) {
      reasons.push("rooming-not-drafted");
    }
    if (counts.overbookedBy > 0) reasons.push("overbooked");
    return {
      departureId: departure.id,
      title: departure.title,
      startDate: dayOf(departure.startDate) as CalendarDate,
      sold: found.sold,
      seatsTotal: departure.seatsTotal,
      reasons,
    };
  });
}
