// Holds (release 7a): seats kept for a lead until a time. A hold counts as held until it expires, is released, or becomes a
// booking. Taking one locks the departure's row and refuses more than the free seats, so two people never hold the same
// last seat. A booking made from an accepted quote on the departure turns that lead's hold into the booking, and a
// booking that goes over the seats is allowed (the traveller agreed): the departure shows it and the lead's owner has a task.
import { type CreateHoldInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { getLead, noticeKey } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { createTask } from "../tasks/index.js";
import {
  assertOpenForSeats,
  countsOf,
  dayWords,
  departureSettingsOf,
  findDepartureForChange,
  freeSeats,
  seatsSoldAndHeld,
} from "./rows.js";
import { announceSeatsFreed } from "./waitlist.js";

const HOUR_MS = 60 * 60 * 1000;
export const HOLD_EXPIRED_KIND = "departure.hold-expired";
export const OVERBOOKED_KIND = "departure.overbooked";

export async function createHold(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateHoldInput,
  now: Date,
): Promise<{ id: string; expiresAt: Date }> {
  const lead = await getLead(tx, access, input.leadId);
  const departure = await findDepartureForChange(tx, input.departureId);
  assertOpenForSeats(departure);
  // A hold past its time that the job has not yet marked is over: it must not block a new one (one active hold a lead).
  await tx.departureHold.updateMany({
    where: { departureId: departure.id, leadId: lead.id, status: "active", expiresAt: { lte: now } },
    data: { status: "expired", endedAt: now },
  });
  const already = await tx.departureHold.findFirst({
    where: { departureId: departure.id, leadId: lead.id, status: "active" },
    select: { id: true },
  });
  if (already !== null) {
    throw new DomainError("CONFLICT", "HOLD_EXISTS", "This lead already holds seats here: release them first");
  }
  if (input.seats > (await freeSeats(tx, departure, now))) {
    throw new DomainError("CONFLICT", "DEPARTURE_FULL", "There aren't that many seats free");
  }
  const hours = input.hours ?? (await departureSettingsOf(tx)).holdHours;
  const expiresAt = new Date(now.getTime() + hours * HOUR_MS);
  const hold = await tx.departureHold
    .create({
      data: {
        departureId: departure.id,
        leadId: lead.id,
        seats: input.seats,
        expiresAt,
        note: input.note,
        createdBy: access.userId,
      },
      select: { id: true },
    })
    .catch((error: unknown) => {
      // The database keeps one active hold a lead on a departure: a second at the same moment meets its unique index.
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        throw new DomainError("CONFLICT", "HOLD_EXISTS", "This lead already holds seats here: release them first");
      }
      throw error;
    });
  await recordAudit(tx, access, {
    action: "departure.hold-created",
    entityType: "departure",
    entityId: departure.id,
    after: { holdId: hold.id, leadId: lead.id, seats: input.seats, expiresAt: expiresAt.toISOString() },
  });
  return { id: hold.id, expiresAt };
}

/** Lets the seats go. A hold already over (released, expired, a booking) is left as it is. */
export async function releaseHold(tx: OrgTx, access: MemberAccess, holdId: string, now: Date): Promise<void> {
  const hold = await tx.departureHold.findUnique({
    where: { id: holdId },
    select: { id: true, departureId: true, leadId: true, seats: true, status: true },
  });
  if (hold === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such hold");
  // The departure's lock first: a booking made at the same moment either converts the hold or finds it released.
  await findDepartureForChange(tx, hold.departureId);
  const released = await tx.departureHold.updateMany({
    where: { id: hold.id, status: "active" },
    data: { status: "released", endedAt: now },
  });
  if (released.count === 0) return;
  await recordAudit(tx, access, {
    action: "departure.hold-released",
    entityType: "departure",
    entityId: hold.departureId,
    before: { holdId: hold.id, leadId: hold.leadId, seats: hold.seats },
  });
  await announceSeatsFreed(tx, hold.departureId);
}

/** The hold a quote may be made from: the lead's active one, not past its time. */
export async function usableHold(tx: OrgTx, holdId: string, now: Date) {
  const hold = await tx.departureHold.findUnique({
    where: { id: holdId },
    select: { id: true, departureId: true, leadId: true, seats: true, status: true, expiresAt: true },
  });
  if (hold === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such hold");
  if (hold.status !== "active" || hold.expiresAt <= now) {
    throw new DomainError("CONFLICT", "SEAT_HOLD_EXPIRED", "These seats are no longer held");
  }
  return hold;
}

/**
 * A booking now stands on the departure (created from an accepted quote): the lead's active holds become the booking and the
 * lead leaves the waitlist; and if the departure now holds more heads than seats, it is overbooked, which is recorded, and
 * the lead's owner is given a task and told (staff never get a silent refusal, and the traveller's yes stands).
 */
export async function bookingJoinedDeparture(
  tx: OrgTx,
  input: { organizationId: string; bookingId: string; departureId: string; leadId: string },
  now: Date,
): Promise<void> {
  const departure = await findDepartureForChange(tx, input.departureId);
  const actor = systemActor(input.organizationId);
  const converted = await tx.departureHold.updateMany({
    where: { departureId: departure.id, leadId: input.leadId, status: "active" },
    data: { status: "converted", bookingId: input.bookingId, endedAt: now },
  });
  await tx.departureWaitlist.deleteMany({ where: { departureId: departure.id, leadId: input.leadId } });
  if (converted.count > 0) {
    await recordAudit(tx, actor, {
      action: "departure.hold-converted",
      entityType: "departure",
      entityId: departure.id,
      after: { bookingId: input.bookingId, leadId: input.leadId },
    });
  }
  const seats = (await seatsSoldAndHeld(tx, [departure.id], now)).get(departure.id) ?? { sold: 0, held: 0 };
  const { overbookedBy } = countsOf(departure.seatsTotal, seats.sold, seats.held);
  if (overbookedBy === 0) return;
  await publishEvent(tx, {
    type: "departure.overbooked",
    payload: { departureId: departure.id, bookingId: input.bookingId },
  });
  const lead = await tx.lead.findUnique({
    where: { id: input.leadId },
    select: { ownerUserId: true, person: { select: { name: true } } },
  });
  const title = `Overbooked by ${String(overbookedBy)}: ${departure.title}`.slice(0, 200);
  await createTask(tx, actor, {
    kind: "task",
    title,
    dueAt: now,
    assigneeUserId: lead?.ownerUserId ?? null,
    record: { recordType: "booking", recordId: input.bookingId },
  });
  if (lead?.ownerUserId != null) {
    await notify(tx, actor, {
      recipientUserIds: [lead.ownerUserId],
      sourceEventId: noticeKey(input.bookingId, OVERBOOKED_KIND),
      kind: OVERBOOKED_KIND,
      title,
      body: `${lead.person.name} accepted their quote on ${dayWords(departure.startDate)}. Find them seats or move someone.`,
      link: `/bookings/${input.bookingId}`,
      channels: ["push"],
    });
  }
}

/**
 * Holds whose time has come: each becomes Expired, the lead's owner is told and given a task "Hold expired: <lead>", and the
 * waitlist is looked at. Returns how many. The status change is what makes it happen once.
 */
export async function expireHolds(tx: OrgTx, organizationId: string, now: Date): Promise<number> {
  const due = await tx.departureHold.findMany({
    where: { status: "active", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: 200,
    select: {
      id: true,
      departureId: true,
      seats: true,
      leadId: true,
      departure: { select: { title: true } },
      lead: { select: { ownerUserId: true, person: { select: { name: true } } } },
    },
  });
  const actor = systemActor(organizationId);
  let expired = 0;
  for (const hold of due) {
    const done = await tx.departureHold.updateMany({
      where: { id: hold.id, status: "active" },
      data: { status: "expired", endedAt: now },
    });
    if (done.count === 0) continue;
    expired += 1;
    await publishEvent(tx, {
      type: "departure.hold-expired",
      payload: { holdId: hold.id, departureId: hold.departureId },
    });
    await recordAudit(tx, actor, {
      action: "departure.hold-expired",
      entityType: "departure",
      entityId: hold.departureId,
      before: { holdId: hold.id, leadId: hold.leadId, seats: hold.seats },
    });
    const title = `Hold expired: ${hold.lead.person.name}`.slice(0, 200);
    await createTask(tx, actor, {
      kind: "task",
      title,
      dueAt: now,
      assigneeUserId: hold.lead.ownerUserId,
      record: { recordType: "lead", recordId: hold.leadId },
    });
    if (hold.lead.ownerUserId !== null) {
      await notify(tx, actor, {
        recipientUserIds: [hold.lead.ownerUserId],
        sourceEventId: noticeKey(hold.id, HOLD_EXPIRED_KIND),
        kind: HOLD_EXPIRED_KIND,
        title,
        body: `${String(hold.seats)} seats on ${hold.departure.title} are free again.`,
        link: `/leads/${hold.leadId}`,
        channels: ["push"],
      });
    }
    await announceSeatsFreed(tx, hold.departureId);
  }
  return expired;
}
