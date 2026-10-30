// A booking from an accepted quote (spec 2.1): "quote.accepted" makes one, once (unique on the quote, so a repeat event adds
// nothing). It copies the departure, numbers itself BK-<year>-<0001> from the agency's counter, freezes the cancellation
// policy of the day, and makes one empty row for each traveller. Requested, it puts a "Confirm booking" task on the lead's
// owner and tells them; made after staff recorded money on the quote, it is Confirmed already. A first payment voided, the
// quote reverts and the booking with it ("quote.reverted").
import { BOOKING_DOCUMENT_PREFIX } from "@travel-crm/contracts/documents";
import { quoteAcceptedEvent, quoteRevertedEvent } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { nextDocumentNumber } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { noticeKey } from "../crm/index.js";
import { announceSeatsFreed, bookingJoinedDeparture } from "../departures/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { defineListener, publishEvent, type EventListener } from "../jobs/index.js";
import { addDays, parseCalendarDate, systemActor, yearIn } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { createTask, finishTasks } from "../tasks/index.js";
import { dayOf } from "./rows.js";
import { rebuildReminders, skipUnsentReminders } from "./reminders.js";
import { currentPolicy, bookingSettingsOf } from "./settings.js";
import { recordBookingEvent } from "./timeline.js";

export const BOOKING_REQUESTED_KIND = "booking.requested";

/** The last day of a trip: its first day plus one for each further day of the plan. */
export function lastDayOf(startDate: Date | null, planDays: unknown): string | null {
  if (startDate === null) return null;
  const days = Array.isArray(planDays) ? planDays.length : 0;
  return addDays(parseCalendarDate(dayOf(startDate)), Math.max(days - 1, 0));
}

export async function createBookingFromQuote(
  tx: OrgTx,
  input: { organizationId: string; quoteId: string; confirmed: boolean },
  now: Date,
): Promise<string | null> {
  // Locked, so a payment recorded at the same moment and this take their turns.
  await tx.$queryRaw`SELECT id FROM quote WHERE id = ${input.quoteId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  const quote = await tx.quote.findUnique({
    where: { id: input.quoteId },
    select: {
      id: true,
      leadId: true,
      title: true,
      status: true,
      startDate: true,
      departureId: true,
      days: true,
      adults: true,
      children: true,
      lead: { select: { ownerUserId: true, person: { select: { name: true } } } },
    },
  });
  if (quote?.status !== "accepted") return null;
  const existing = await tx.booking.findFirst({ where: { quoteId: quote.id }, select: { id: true } });
  if (existing !== null) return existing.id;
  const actor = systemActor(input.organizationId);
  // A booking the AI took stands on a quote made from a chat: the real quote accepted now takes its place, so the lead keeps one.
  const chat = await tx.booking.findFirst({
    where: { leadId: quote.leadId, quotePlaceholder: true, status: { in: ["requested", "confirmed"] } },
    select: { id: true, quoteId: true },
  });
  if (chat !== null) {
    const endDay = lastDayOf(quote.startDate, quote.days);
    await tx.booking.update({
      where: { id: chat.id },
      data: {
        quoteId: quote.id,
        quotePlaceholder: false,
        startDate: quote.startDate,
        endDate: endDay === null ? null : new Date(`${endDay}T00:00:00Z`),
      },
    });
    await tx.quote.update({ where: { id: chat.quoteId }, data: { status: "replaced", replacedById: quote.id } });
    await recordAudit(tx, actor, {
      action: "booking.quote-replaced",
      entityType: "booking",
      entityId: chat.id,
      after: { quoteId: quote.id },
    });
    return chat.id;
  }
  const timeZone = await organizationTimeZone(tx, input.organizationId);
  const number = await nextDocumentNumber(tx, { prefix: BOOKING_DOCUMENT_PREFIX, year: yearIn(now, timeZone) });
  const settings = await bookingSettingsOf(tx);
  const policy = await currentPolicy(tx);
  const endDay = lastDayOf(quote.startDate, quote.days);
  const booking = await tx.booking.create({
    data: {
      quoteId: quote.id,
      leadId: quote.leadId,
      number,
      status: input.confirmed ? "confirmed" : "requested",
      startDate: quote.startDate,
      endDate: endDay === null ? null : new Date(`${endDay}T00:00:00Z`),
      departureId: quote.departureId,
      level: settings.defaultLevel,
      policySnapshot: policy,
      emergencyName: settings.emergencyName,
      emergencyPhone: settings.emergencyPhone,
      ...(input.confirmed ? { confirmedAt: now } : {}),
    },
    select: { id: true },
  });
  const heads = quote.adults + quote.children;
  await tx.bookingTraveller.createMany({
    data: Array.from({ length: heads }, (_, position) => ({ bookingId: booking.id, position })),
  });
  // On a group departure the booking takes the seats: the lead's hold becomes it, and going over the seats is noted.
  if (quote.departureId !== null) {
    await bookingJoinedDeparture(
      tx,
      {
        organizationId: input.organizationId,
        bookingId: booking.id,
        departureId: quote.departureId,
        leadId: quote.leadId,
      },
      now,
    );
  }
  await recordAudit(tx, actor, {
    action: "booking.created",
    entityType: "booking",
    entityId: booking.id,
    after: { number, status: input.confirmed ? "confirmed" : "requested", travellers: heads },
  });
  await recordBookingEvent(tx, actor, { leadId: quote.leadId, bookingId: booking.id, event: "created" });
  await publishEvent(tx, { type: "booking.created", payload: { bookingId: booking.id } });
  if (input.confirmed) {
    await rebuildReminders(tx, booking.id, now);
    await publishEvent(tx, { type: "booking.confirmed", payload: { bookingId: booking.id } });
    return booking.id;
  }
  const task = await createTask(tx, actor, {
    kind: "task",
    title: `Confirm booking ${number} for ${quote.lead.person.name}`.slice(0, 200),
    dueAt: now,
    assigneeUserId: quote.lead.ownerUserId,
    record: { recordType: "booking", recordId: booking.id },
  });
  await tx.booking.update({ where: { id: booking.id }, data: { confirmTaskId: task.id } });
  if (quote.lead.ownerUserId !== null) {
    await notify(tx, actor, {
      recipientUserIds: [quote.lead.ownerUserId],
      sourceEventId: noticeKey(booking.id, BOOKING_REQUESTED_KIND),
      kind: BOOKING_REQUESTED_KIND,
      title: `${quote.lead.person.name} accepted their quote`,
      body: `Confirm booking ${number} to ask for the advance.`,
      link: `/bookings/${booking.id}`,
      channels: ["push"],
    });
  }
  return booking.id;
}

/** "quote.accepted": the booking is made in the event's organization. Safe to run twice. */
export function quoteAcceptedListener(): EventListener {
  return defineListener({
    name: "bookings.create-from-quote",
    eventType: "quote.accepted",
    payload: quoteAcceptedEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        await createBookingFromQuote(
          tx,
          { organizationId: event.organizationId, quoteId: event.payload.quoteId, confirmed: event.payload.confirmed },
          event.occurredAt,
        );
      });
    },
  });
}

/** "quote.reverted": the first payment that made the quote a sale was voided, so the booking made from it goes with it. */
export function quoteRevertedListener(): EventListener {
  return defineListener({
    name: "bookings.remove-with-quote",
    eventType: "quote.reverted",
    payload: quoteRevertedEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const booking = await tx.booking.findFirst({
          where: { quoteId: event.payload.quoteId, status: { in: ["requested", "confirmed"] } },
          select: { id: true, confirmTaskId: true, leadId: true, departureId: true },
        });
        if (booking === null) return;
        const actor = systemActor(event.organizationId);
        await skipUnsentReminders(tx, actor, booking.id, "quote_reverted", event.occurredAt);
        await finishTasks(tx, actor, [booking.confirmTaskId], "cancelled", event.occurredAt);
        await tx.booking.update({ where: { id: booking.id }, data: { deletedAt: event.occurredAt, deletedBy: null } });
        await recordAudit(tx, actor, {
          action: "booking.removed",
          entityType: "booking",
          entityId: booking.id,
          after: { reason: "quote_reverted" },
        });
        if (booking.departureId !== null) await announceSeatsFreed(tx, booking.departureId);
      });
    },
  });
}
