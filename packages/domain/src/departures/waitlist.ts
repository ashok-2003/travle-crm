// The waitlist (release 7a): a lead waiting for seats on a full departure. When seats free up (a booking cancelled, a hold
// released or expired, seats added, the departure reopened) "departure.seats-freed" is published, and the worker tells the
// owner of the first lead waiting whose party now fits, once for each event.
import { seatsFreedEvent, type AddWaitlistInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { getLead, noticeKey } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { defineListener, publishEvent, type EventListener } from "../jobs/index.js";
import { DomainError, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { assertOpenForSeats, dayWords, findDeparture, findDepartureForChange, freeSeats } from "./rows.js";

export const SEATS_FREE_KIND = "departure.seats-free";

/** Puts the lead on the waitlist for these seats; already there, the seats are changed. */
export async function addToWaitlist(tx: OrgTx, access: MemberAccess, input: AddWaitlistInput): Promise<void> {
  const lead = await getLead(tx, access, input.leadId);
  const departure = await findDepartureForChange(tx, input.departureId);
  assertOpenForSeats(departure);
  const existing = await tx.departureWaitlist.findFirst({
    where: { departureId: departure.id, leadId: lead.id },
    select: { id: true },
  });
  if (existing !== null) {
    await tx.departureWaitlist.update({ where: { id: existing.id }, data: { seats: input.seats } });
  } else {
    await tx.departureWaitlist.create({
      data: { departureId: departure.id, leadId: lead.id, seats: input.seats, createdBy: access.userId },
    });
  }
  await recordAudit(tx, access, {
    action: "departure.waitlist-added",
    entityType: "departure",
    entityId: departure.id,
    after: { leadId: lead.id, seats: input.seats },
  });
}

export async function removeFromWaitlist(tx: OrgTx, access: MemberAccess, waitlistId: string): Promise<void> {
  const entry = await tx.departureWaitlist.findUnique({
    where: { id: waitlistId },
    select: { id: true, departureId: true, leadId: true, seats: true },
  });
  if (entry === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not on the waitlist");
  await tx.departureWaitlist.delete({ where: { id: entry.id } });
  await recordAudit(tx, access, {
    action: "departure.waitlist-removed",
    entityType: "departure",
    entityId: entry.departureId,
    before: { leadId: entry.leadId, seats: entry.seats },
  });
}

/** Seats may be free now: the worker looks at the waitlist (only when someone waits, so most changes publish nothing). */
export async function announceSeatsFreed(tx: OrgTx, departureId: string): Promise<void> {
  const waiting = await tx.departureWaitlist.count({ where: { departureId } });
  if (waiting === 0) return;
  await publishEvent(tx, { type: "departure.seats-freed", payload: { departureId } });
}

/** "departure.seats-freed": the first lead waiting whose party fits has its owner told. Safe to run twice (keyed on the event). */
export function seatsFreedListener(): EventListener {
  return defineListener({
    name: "departures.notify-waitlist",
    eventType: "departure.seats-freed",
    payload: seatsFreedEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const departure = await findDeparture(tx, event.payload.departureId);
        if (departure.status !== "open") return;
        const free = await freeSeats(tx, departure, new Date());
        if (free <= 0) return;
        const waiting = await tx.departureWaitlist.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          where: { departureId: departure.id, seats: { lte: free } },
          take: 1,
          select: {
            seats: true,
            leadId: true,
            lead: { select: { ownerUserId: true, person: { select: { name: true } } } },
          },
        });
        const next = waiting[0];
        if (next?.lead.ownerUserId == null) return;
        await notify(tx, systemActor(event.organizationId), {
          recipientUserIds: [next.lead.ownerUserId],
          sourceEventId: noticeKey(event.id, SEATS_FREE_KIND),
          kind: SEATS_FREE_KIND,
          title: `Seats free on ${departure.title}`,
          body: `${next.lead.person.name} is waiting for ${String(next.seats)} seats on ${dayWords(departure.startDate)}.`,
          link: `/leads/${next.leadId}`,
          channels: ["push"],
        });
      });
    },
  });
}
