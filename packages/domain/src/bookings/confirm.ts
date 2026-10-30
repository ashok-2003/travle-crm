// Confirming a booking (spec 2.1): one tap says yes to the traveller's request and shows the advance. A quote with no
// payments due gets the agency's default schedule (the advance now, the balance some days before departure) made from
// the settings, which staff can change; the payments due always add up to the trip's total. The booking's reminders are
// made when it is confirmed and again when its payments due change.
import type { ConfirmBookingInput, SaveScheduleInput, ScheduleRow } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { addDays, calendarDateIn, DomainError, parseCalendarDate, type Actor } from "../kernel/index.js";
import { finishTasks } from "../tasks/index.js";
import { rebuildReminders } from "./reminders.js";
import { assertOpen, asDate, dayOf, findBookingForChange, findBookingForSystem, type BookingRow } from "./rows.js";
import { bookingSettingsOf } from "./settings.js";
import { recordBookingEvent } from "./timeline.js";

/** The agency's default schedule for a trip worth `totalPaise` that starts on `startDay` (or has no date), as of today. */
export function defaultSchedule(
  settings: { advanceBasisPoints: number; balanceDaysBefore: number },
  input: { totalPaise: number; startDay: string | null; today: string },
): Omit<ScheduleRow, "id">[] {
  const advance = Math.round((input.totalPaise * settings.advanceBasisPoints) / 10_000);
  const today = parseCalendarDate(input.today);
  const balanceDay =
    input.startDay === null
      ? addDays(today, 30)
      : addDays(parseCalendarDate(input.startDay), -settings.balanceDaysBefore);
  // The balance never falls due before the advance.
  const dueOn = balanceDay < today ? today : balanceDay;
  if (advance <= 0 || advance >= input.totalPaise) {
    return input.totalPaise > 0 ? [{ label: "Payment", amountPaise: input.totalPaise, dueOn }] : [];
  }
  return [
    { label: "Advance", amountPaise: advance, dueOn: today },
    { label: "Balance", amountPaise: input.totalPaise - advance, dueOn },
  ];
}

/** What Confirm offers a booking whose quote has no payments due: the agency's default schedule as of now. */
export async function offeredSchedule(tx: OrgTx, booking: BookingRow, now: Date): Promise<Omit<ScheduleRow, "id">[]> {
  const settings = await bookingSettingsOf(tx);
  const timeZone = await organizationTimeZone(tx, booking.organizationId);
  return defaultSchedule(settings, {
    totalPaise: Number(booking.quote.totalPaise),
    startDay: booking.startDate === null ? null : dayOf(booking.startDate),
    today: calendarDateIn(now, timeZone),
  });
}

function assertAddsUp(rows: readonly ScheduleRow[], totalPaise: number): void {
  const sum = rows.reduce((total, row) => total + row.amountPaise, 0);
  if (sum !== totalPaise) {
    throw new DomainError("CONFLICT", "INSTALLMENTS_MISMATCH", "The payments due must add up to the quote's total");
  }
}

export async function confirmBooking(
  tx: OrgTx,
  access: MemberAccess,
  input: ConfirmBookingInput,
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  await confirmRequested(tx, access, booking, input.installments, now);
}

/** Confirms a booking that waits for the agency, as `actor`, whoever may see it: for what confirms one by itself (the AI's). */
export async function confirmBookingAs(tx: OrgTx, actor: Actor, bookingId: string, now: Date): Promise<void> {
  await confirmRequested(tx, actor, await findBookingForSystem(tx, bookingId, true), undefined, now);
}

async function confirmRequested(
  tx: OrgTx,
  actor: Actor,
  booking: BookingRow,
  installments: ScheduleRow[] | undefined,
  now: Date,
): Promise<void> {
  if (booking.status === "confirmed") return;
  if (booking.status !== "requested") {
    throw new DomainError("CONFLICT", "BOOKING_NOT_REQUESTED", "Only a requested booking is confirmed");
  }
  const existing = await tx.quoteInstallment.count({ where: { quoteId: booking.quoteId } });
  if (existing === 0) {
    const rows = installments ?? (await offeredSchedule(tx, booking, now));
    assertAddsUp(rows, Number(booking.quote.totalPaise));
    for (const row of rows) {
      await tx.quoteInstallment.create({
        data: {
          quoteId: booking.quoteId,
          label: row.label,
          amountPaise: BigInt(row.amountPaise),
          dueOn: asDate(row.dueOn),
        },
      });
    }
  }
  await tx.booking.update({
    where: { id: booking.id },
    data: { status: "confirmed", confirmedAt: now, confirmedBy: actor.userId },
  });
  await finishTasks(tx, actor, [booking.confirmTaskId], "done", now);
  await rebuildReminders(tx, booking.id, now);
  await recordAudit(tx, actor, {
    action: "booking.confirmed",
    entityType: "booking",
    entityId: booking.id,
    before: { status: "requested" },
    after: { status: "confirmed" },
  });
  await recordBookingEvent(tx, actor, { leadId: booking.leadId, bookingId: booking.id, event: "confirmed" });
  await publishEvent(tx, { type: "booking.confirmed", payload: { bookingId: booking.id } });
}

/** Changes the payments due on a booking: the rows given are kept or changed (by id) or added, and the others removed. */
export async function saveSchedule(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveScheduleInput,
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertOpen(booking);
  assertAddsUp(input.installments, Number(booking.quote.totalPaise));
  const current = await tx.quoteInstallment.findMany({ where: { quoteId: booking.quoteId }, select: { id: true } });
  const kept = new Set(input.installments.flatMap((row) => (row.id === undefined ? [] : [row.id])));
  if ([...kept].some((id) => !current.some((row) => row.id === id))) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such payment due");
  }
  const removed = current.filter((row) => !kept.has(row.id));
  for (const row of removed) {
    const used = await tx.paymentClaim.count({ where: { installmentId: row.id } });
    const sent = await tx.bookingReminder.count({ where: { installmentId: row.id, status: { not: "scheduled" } } });
    if (used > 0 || sent > 0) {
      throw new DomainError(
        "CONFLICT",
        "INSTALLMENT_IN_USE",
        "A payment someone claimed or was reminded of can't be removed",
      );
    }
    await tx.bookingReminder.deleteMany({ where: { installmentId: row.id } });
    await tx.quoteInstallment.delete({ where: { id: row.id } });
  }
  for (const row of input.installments) {
    const data = { label: row.label, amountPaise: BigInt(row.amountPaise), dueOn: asDate(row.dueOn) };
    if (row.id === undefined) await tx.quoteInstallment.create({ data: { ...data, quoteId: booking.quoteId } });
    else await tx.quoteInstallment.update({ where: { id: row.id }, data });
  }
  if (booking.status === "confirmed") await rebuildReminders(tx, booking.id, now);
  await recordAudit(tx, access, {
    action: "booking.schedule-changed",
    entityType: "booking",
    entityId: booking.id,
    after: { payments: input.installments.length },
  });
}
