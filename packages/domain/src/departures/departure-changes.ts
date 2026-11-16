// Changes to a departure that are not an edit form: cancelling it, and what a package's schedule does to the departures it made
// (change the last day and seats, or open again a day it had cancelled). Each is audited in the same transaction.
import type { CancelDepartureInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Actor } from "../kernel/index.js";
import { asDate, dayOf, findDepartureForChange, type DepartureRow } from "./rows.js";
import { announceSeatsFreed } from "./waitlist.js";

/** Why the schedule cancels a departure: generation reads it to know a cancelled day is its own to open again. */
export const SCHEDULE_CANCEL_REASON = "The package no longer departs on this day";

export const auditColumns = {
  title: true,
  startDate: true,
  endDate: true,
  seatsTotal: true,
  status: true,
  templateId: true,
  priceSinglePaise: true,
  priceDoublePaise: true,
  priceTriplePaise: true,
  priceQuadPaise: true,
  priceChildBedPaise: true,
  priceChildNoBedPaise: true,
} as const;

/** A departure's figures in an audit entry: what changed, never the staff's notes. Money is paise as a string. */
export const auditView = (row: Pick<DepartureRow, keyof typeof auditColumns>) => {
  const paise = (value: bigint | null) => (value === null ? null : value.toString());
  return {
    title: row.title,
    startDate: dayOf(row.startDate),
    endDate: dayOf(row.endDate),
    seatsTotal: row.seatsTotal,
    status: row.status,
    templateId: row.templateId,
    priceSinglePaise: paise(row.priceSinglePaise),
    priceDoublePaise: paise(row.priceDoublePaise),
    priceTriplePaise: paise(row.priceTriplePaise),
    priceQuadPaise: paise(row.priceQuadPaise),
    priceChildBedPaise: paise(row.priceChildBedPaise),
    priceChildNoBedPaise: paise(row.priceChildNoBedPaise),
  };
};

/**
 * Cancels a departure with a reason. Its bookings are not cancelled: staff move or cancel each (they are listed on the
 * departure). Its active holds are released, and its waitlist cleared, since nobody can join a cancelled batch.
 */
export async function cancelDeparture(tx: OrgTx, actor: Actor, input: CancelDepartureInput, now: Date): Promise<void> {
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
  await recordAudit(tx, actor, {
    action: "departure.cancelled",
    entityType: "departure",
    entityId: before.id,
    before: { status: before.status },
    after: { status: "cancelled", reason: input.reason },
  });
}

/** The schedule moved a generated departure's last day or seats: one audited change, and a waiting lead hears of more seats. */
export async function changeScheduledDeparture(
  tx: OrgTx,
  actor: Actor,
  departureId: string,
  change: { endDate: string; seatsTotal: number },
): Promise<void> {
  const before = await findDepartureForChange(tx, departureId);
  const after = await tx.departure.update({
    where: { id: before.id },
    data: { endDate: asDate(change.endDate), seatsTotal: change.seatsTotal },
    select: auditColumns,
  });
  await recordAudit(tx, actor, {
    action: "departure.changed",
    entityType: "departure",
    entityId: before.id,
    before: auditView(before),
    after: auditView(after),
  });
  if (after.seatsTotal > before.seatsTotal) await announceSeatsFreed(tx, before.id);
}

/** The package departs on a day it had cancelled again: the departure opens, with the package's size, audited as a reopening. */
export async function reopenScheduledDeparture(
  tx: OrgTx,
  actor: Actor,
  departureId: string,
  change: { endDate: string; seatsTotal: number },
): Promise<void> {
  const before = await findDepartureForChange(tx, departureId);
  await tx.departure.update({
    where: { id: before.id },
    data: { status: "open", cancelledReason: null, endDate: asDate(change.endDate), seatsTotal: change.seatsTotal },
  });
  await recordAudit(tx, actor, {
    action: "departure.reopened",
    entityType: "departure",
    entityId: before.id,
    before: { status: before.status },
    after: { status: "open" },
  });
}
