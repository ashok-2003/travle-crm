// Departures (release 7a): a group batch with seats. Staff list them by date, add and change one, close it to new seats, or
// cancel it with a reason (its bookings stay: staff move or cancel each). Every change is audited. The seats a departure
// shows are worked out each time (rows.ts), never counted in a column.
import {
  DEPARTURES_LIST_LIMIT,
  departureDetail,
  departureList,
  type CancelDepartureInput,
  type CreateDepartureInput,
  type DepartureDetail,
  type DepartureSummary,
  type ListDeparturesInput,
  type UpdateDepartureInput,
} from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { calendarDateIn } from "../kernel/index.js";
import {
  asDate,
  countsOf,
  dayOf,
  departureColumns,
  departureSettingsOf,
  findDeparture,
  findDepartureForChange,
  seatsSoldAndHeld,
  stateOf,
  type DepartureRow,
} from "./rows.js";
import { announceSeatsFreed } from "./waitlist.js";

/** A departure's figures in an audit entry: what changed, never the staff's notes. */
const auditView = (row: Pick<DepartureRow, "title" | "startDate" | "endDate" | "seatsTotal" | "status">) => ({
  title: row.title,
  startDate: dayOf(row.startDate),
  endDate: dayOf(row.endDate),
  seatsTotal: row.seatsTotal,
  status: row.status,
});

function summaryOf(
  row: DepartureRow,
  seats: { sold: number; held: number } | undefined,
  fillingFastPercent: number,
): DepartureSummary {
  const counts = countsOf(row.seatsTotal, seats?.sold ?? 0, seats?.held ?? 0);
  return {
    id: row.id,
    title: row.title,
    destinationName: row.destination?.name ?? null,
    startDate: dayOf(row.startDate),
    endDate: dayOf(row.endDate),
    pricePaise: row.pricePaise === null ? null : Number(row.pricePaise),
    status: row.status as DepartureSummary["status"],
    state: stateOf(row, counts, fillingFastPercent),
    ...counts,
  };
}

/** Departures by date: coming up (the next first), past (the latest first), or cancelled. */
export async function listDepartures(
  tx: OrgTx,
  access: MemberAccess,
  input: ListDeparturesInput,
  now: Date,
): Promise<DepartureSummary[]> {
  const today = asDate(calendarDateIn(now, await organizationTimeZone(tx, access.organizationId)));
  const where =
    input.filter === "cancelled"
      ? { status: "cancelled" }
      : input.filter === "upcoming"
        ? { status: { not: "cancelled" }, endDate: { gte: today } }
        : { status: { not: "cancelled" }, endDate: { lt: today } };
  const rows = await tx.departure.findMany({
    where,
    orderBy: [{ startDate: input.filter === "upcoming" ? "asc" : "desc" }, { id: "asc" }],
    take: DEPARTURES_LIST_LIMIT,
    select: departureColumns,
  });
  const [seats, settings] = await Promise.all([
    seatsSoldAndHeld(
      tx,
      rows.map((row) => row.id),
      now,
    ),
    departureSettingsOf(tx),
  ]);
  return departureList.parse(rows.map((row) => summaryOf(row, seats.get(row.id), settings.fillingFastPercent)));
}

const namesOf = async (tx: OrgTx, leadIds: readonly string[]) =>
  new Map(
    (
      await tx.lead.findMany({
        where: { id: { in: [...leadIds] } },
        select: { id: true, person: { select: { name: true } } },
      })
    ).map((lead) => [lead.id, lead.person.name]),
  );

export async function getDeparture(tx: OrgTx, departureId: string, now: Date): Promise<DepartureDetail> {
  const row = await findDeparture(tx, departureId);
  const [seats, settings, bookings, holds, waitlist] = await Promise.all([
    seatsSoldAndHeld(tx, [row.id], now),
    departureSettingsOf(tx),
    tx.booking.findMany({
      where: { departureId: row.id, status: { in: ["requested", "confirmed"] } },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        status: true,
        leadId: true,
        quote: { select: { adults: true, children: true } },
        travellers: { select: { completeAt: true } },
      },
    }),
    tx.departureHold.findMany({
      where: { departureId: row.id, status: "active", expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
      select: { id: true, leadId: true, seats: true, expiresAt: true, note: true, createdAt: true },
    }),
    tx.departureWaitlist.findMany({
      where: { departureId: row.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, leadId: true, seats: true, createdAt: true },
    }),
  ]);
  const names = await namesOf(tx, [
    ...bookings.map((booking) => booking.leadId),
    ...holds.map((hold) => hold.leadId),
    ...waitlist.map((entry) => entry.leadId),
  ]);
  const nameOf = (leadId: string) => names.get(leadId) ?? "";
  return departureDetail.parse({
    ...summaryOf(row, seats.get(row.id), settings.fillingFastPercent),
    destinationId: row.destinationId,
    cutoffOn: row.cutoffOn === null ? null : dayOf(row.cutoffOn),
    notes: row.notes,
    cancelledReason: row.cancelledReason,
    bookings: bookings.map((booking) => ({
      bookingId: booking.id,
      number: booking.number,
      leadId: booking.leadId,
      customerName: nameOf(booking.leadId),
      status: booking.status,
      heads: booking.quote.adults + booking.quote.children,
      travellersComplete: booking.travellers.filter((traveller) => traveller.completeAt !== null).length,
    })),
    holds: holds.map((hold) => ({
      id: hold.id,
      leadId: hold.leadId,
      customerName: nameOf(hold.leadId),
      seats: hold.seats,
      expiresAt: hold.expiresAt.toISOString(),
      note: hold.note,
      createdAt: hold.createdAt.toISOString(),
    })),
    waitlist: waitlist.map((entry) => ({
      id: entry.id,
      leadId: entry.leadId,
      customerName: nameOf(entry.leadId),
      seats: entry.seats,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
}

const columnsOf = (input: CreateDepartureInput) => ({
  title: input.title,
  destinationId: input.destinationId,
  startDate: asDate(input.startDate),
  endDate: asDate(input.endDate),
  seatsTotal: input.seatsTotal,
  pricePaise: input.pricePaise === null ? null : BigInt(input.pricePaise),
  cutoffOn: input.cutoffOn === null ? null : asDate(input.cutoffOn),
  notes: input.notes,
});

export async function createDeparture(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateDepartureInput,
): Promise<{ id: string }> {
  const created = await tx.departure.create({
    data: { ...columnsOf(input), createdBy: access.userId },
    select: { id: true, title: true, startDate: true, endDate: true, seatsTotal: true, status: true },
  });
  await recordAudit(tx, access, {
    action: "departure.created",
    entityType: "departure",
    entityId: created.id,
    after: auditView(created),
  });
  return { id: created.id };
}

export async function updateDeparture(tx: OrgTx, access: MemberAccess, input: UpdateDepartureInput): Promise<void> {
  const before = await findDepartureForChange(tx, input.departureId);
  const after = await tx.departure.update({
    where: { id: before.id },
    data: columnsOf(input),
    select: { title: true, startDate: true, endDate: true, seatsTotal: true, status: true },
  });
  await recordAudit(tx, access, {
    action: "departure.changed",
    entityType: "departure",
    entityId: before.id,
    before: auditView(before),
    after: auditView(after),
  });
  // More seats than before may let a waiting lead in; the quote of a booking keeps its own dates.
  if (after.seatsTotal > before.seatsTotal) await announceSeatsFreed(tx, before.id);
}

/** Closed departures take no new holds or waitlist joins; reopening is the same one tap. */
export async function setDepartureStatus(
  tx: OrgTx,
  access: MemberAccess,
  input: { departureId: string; status: "open" | "closed" },
): Promise<void> {
  const before = await findDepartureForChange(tx, input.departureId);
  if (before.status === "cancelled" || before.status === input.status) return;
  await tx.departure.update({ where: { id: before.id }, data: { status: input.status } });
  await recordAudit(tx, access, {
    action: input.status === "closed" ? "departure.closed" : "departure.reopened",
    entityType: "departure",
    entityId: before.id,
    before: { status: before.status },
    after: { status: input.status },
  });
  if (input.status === "open") await announceSeatsFreed(tx, before.id);
}

/**
 * Cancels a departure with a reason. Its bookings are not cancelled: staff move or cancel each (they are listed on the
 * departure). Its active holds are released, and its waitlist cleared, since nobody can join a cancelled batch.
 */
export async function cancelDeparture(
  tx: OrgTx,
  access: MemberAccess,
  input: CancelDepartureInput,
  now: Date,
): Promise<void> {
  const before = await findDepartureForChange(tx, input.departureId);
  if (before.status === "cancelled") return;
  await tx.departure.update({
    where: { id: before.id },
    data: { status: "cancelled", cancelledReason: input.reason },
  });
  await tx.departureHold.updateMany({
    where: { departureId: before.id, status: "active" },
    data: { status: "released", endedAt: now },
  });
  await tx.departureWaitlist.deleteMany({ where: { departureId: before.id } });
  await recordAudit(tx, access, {
    action: "departure.cancelled",
    entityType: "departure",
    entityId: before.id,
    before: { status: before.status },
    after: { status: "cancelled", reason: input.reason },
  });
}
