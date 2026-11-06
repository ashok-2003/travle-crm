// What a change to a group package's schedule does to the departures the schedule already made: a generated departure
// (one still on the day it was made for) that no longer fits is cancelled, or has its last day and seats brought in line,
// unless it has sales or holds, when it is left alone and the team is told once. A departure staff added or moved is theirs.
import type { OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import { addDays, parseCalendarDate, type Actor, type CalendarDate } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { cancelDeparture, changeScheduledDeparture } from "./departures.js";
import { asDate, dayOf, dayWords, findDepartureForChange } from "./rows.js";

/** The notice that a schedule change left a departure with sales as it was. */
export const SCHEDULE_KEPT_KIND = "departure.schedule-kept";

export interface Reconciled {
  cancelled: number;
  updated: number;
  kept: number;
}

/** The owners of the leads that hold, booked or were quoted seats on the departure: who must hear it was left alone. */
async function ownersOfSales(tx: OrgTx, departureId: string, now: Date): Promise<{ busy: boolean; owners: string[] }> {
  const [holds, bookings, quotes] = await Promise.all([
    tx.departureHold.findMany({
      where: { departureId, status: "active", expiresAt: { gt: now } },
      select: { leadId: true },
    }),
    tx.booking.findMany({
      where: { departureId, status: { in: ["requested", "confirmed"] } },
      select: { leadId: true },
    }),
    tx.quote.findMany({ where: { departureId }, select: { leadId: true } }),
  ]);
  const leadIds = [...new Set([...holds, ...bookings, ...quotes].map((row) => row.leadId))];
  const leads = await tx.lead.findMany({ where: { id: { in: leadIds } }, select: { ownerUserId: true } });
  const owners = leads.flatMap((lead) => (lead.ownerUserId === null ? [] : [lead.ownerUserId]));
  return { busy: leadIds.length > 0, owners: [...new Set(owners)] };
}

/** Brings the package's generated departures after today in line with its days, months, nights and seats. */
export async function reconcilePackageDepartures(
  tx: OrgTx,
  actor: Actor,
  packageId: string,
  today: CalendarDate,
): Promise<Reconciled> {
  const result: Reconciled = { cancelled: 0, updated: 0, kept: 0 };
  const pack = await tx.quoteTemplate.findUnique({
    where: { id: packageId },
    select: { kind: true, nights: true, seatsPerDeparture: true, weeklyDays: true, departureMonths: true },
  });
  if (pack?.kind !== "group") return result;
  const now = new Date();
  const candidates = await tx.departure.findMany({
    where: {
      templateId: packageId,
      status: { in: ["open", "closed"] },
      startDate: { gt: asDate(today) },
      scheduledOn: { not: null },
    },
    orderBy: { startDate: "asc" },
    select: { id: true, startDate: true, scheduledOn: true },
  });
  for (const candidate of candidates) {
    // Staff moved it off the day the schedule chose: it is theirs now.
    if (candidate.scheduledOn?.getTime() !== candidate.startDate.getTime()) continue;
    const row = await findDepartureForChange(tx, candidate.id);
    if (row.status === "cancelled") continue;
    const day = dayOf(row.startDate);
    const fits =
      pack.weeklyDays.includes(row.startDate.getUTCDay()) &&
      (pack.departureMonths.length === 0 || pack.departureMonths.includes(Number(day.slice(5, 7))));
    const wantedEnd = pack.nights === null ? dayOf(row.endDate) : addDays(parseCalendarDate(day), pack.nights);
    const wantedSeats = pack.seatsPerDeparture ?? row.seatsTotal;
    if (fits && wantedEnd === dayOf(row.endDate) && wantedSeats === row.seatsTotal) continue;
    const sales = await ownersOfSales(tx, row.id, now);
    if (sales.busy) {
      result.kept += 1;
      await notify(tx, actor, {
        recipientUserIds: sales.owners,
        sourceEventId: noticeKey(row.id, SCHEDULE_KEPT_KIND),
        kind: SCHEDULE_KEPT_KIND,
        title: `Schedule changed: ${row.title}`.slice(0, 200),
        body: `The ${dayWords(row.startDate)} departure has seats held, quoted or booked, so it was left as it is. Check it still suits the package.`,
        link: `/departures/${row.id}`,
        channels: ["push"],
      });
    } else if (fits) {
      await changeScheduledDeparture(tx, actor, row.id, { endDate: wantedEnd, seatsTotal: wantedSeats });
      result.updated += 1;
    } else {
      await cancelDeparture(
        tx,
        actor,
        { departureId: row.id, reason: "The package no longer departs on this day" },
        now,
      );
      result.cancelled += 1;
    }
  }
  return result;
}
