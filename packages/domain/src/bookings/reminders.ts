// A booking's reminders (spec 5.6): three kinds, plain code, no AI. The balance before each unpaid payment's day, the
// traveller's details and the packing list some days before departure (only while a traveller's details are missing),
// and where to report the evening before. Rows are made when the booking is confirmed and made again, the unsent ones, when
// the payments or the essentials change. A minute job sends what is due between 10:00 and 20:00 in the agency's zone,
// through the sales automation's one WhatsApp send, with the template the agency mapped, only to a traveller who agreed
// to trip updates; without that, or without a template, the reminder becomes a task for the lead's owner to do by hand.
// Each row is claimed before it is sent and the message keyed by the row, so a repeat sends nothing twice.
import type { Database, OrgTx } from "@travel-crm/db";
import { createTask, finishTasks } from "../tasks/index.js";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { addDays, instantAt, parseCalendarDate, parseTimeOfDay, systemActor, type Actor } from "../kernel/index.js";
import { QUOTE_RECORD_TYPE, coveredInstallments } from "../quotes/index.js";
import { fillParams, leadFacts, sendToLead, workingMoment, type FillContext } from "../sales/index.js";
import { createShareLink } from "../share-links/index.js";
import { dayOf, paidOnQuote } from "./rows.js";
import { bookingSettingsOf } from "./settings.js";
import { recordBookingEvent } from "./timeline.js";

/** The queue of the minute's reminder work. */
export const BOOKING_REMINDERS_QUEUE = "bookings.send-reminders";
const DAY = 24 * 3_600_000;
/** A reminder that came due this long ago is not sent: the day it was for has passed. */
const STALE_AFTER = 2 * DAY;
/** A reminder the WhatsApp number could not carry for this long becomes a task. */
const GIVE_UP_AFTER = 6 * 3_600_000;
const MORNING = parseTimeOfDay("10:00");
const EVENING = parseTimeOfDay("18:00");

interface Wanted {
  key: string;
  kind: "balance" | "details" | "reporting";
  installmentId: string | null;
  sendAt: Date;
}

/** The reminders a confirmed booking should have, from its payments due, its departure and the agency's days. */
export async function wantedReminders(tx: OrgTx, bookingId: string, now: Date): Promise<Wanted[]> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: { organizationId: true, status: true, startDate: true, quoteId: true },
  });
  if (booking?.status !== "confirmed") return [];
  const settings = await bookingSettingsOf(tx);
  const timeZone = await organizationTimeZone(tx, booking.organizationId);
  const wanted: Wanted[] = [];
  const paid = await paidOnQuote(tx, booking.quoteId);
  const dues = await tx.quoteInstallment.findMany({
    where: { quoteId: booking.quoteId },
    select: { id: true, amountPaise: true, dueOn: true },
  });
  const covered = coveredInstallments(
    dues.map((due) => ({ id: due.id, amountPaise: Number(due.amountPaise), dueOn: dayOf(due.dueOn) })),
    paid,
  );
  for (const due of covered) {
    if (due.paid) continue;
    for (const days of settings.balanceReminderDays) {
      wanted.push({
        key: `balance:${due.id}:${String(days)}`,
        kind: "balance",
        installmentId: due.id,
        sendAt: instantAt(addDays(parseCalendarDate(due.dueOn), -days), MORNING, timeZone),
      });
    }
  }
  if (booking.startDate !== null) {
    const start = parseCalendarDate(dayOf(booking.startDate));
    wanted.push({
      key: `details:-:${String(settings.detailsReminderDays)}`,
      kind: "details",
      installmentId: null,
      sendAt: instantAt(addDays(start, -settings.detailsReminderDays), MORNING, timeZone),
    });
    wanted.push({
      key: "reporting:-:1",
      kind: "reporting",
      installmentId: null,
      sendAt: instantAt(addDays(start, -1), EVENING, timeZone),
    });
  }
  // A reminder whose day passed long ago is not made (a booking confirmed late sends no stale ones).
  return wanted.filter((row) => row.sendAt.getTime() > now.getTime() - STALE_AFTER);
}

/**
 * Makes the booking's unsent reminders again from what stands now: the scheduled ones that no longer apply are removed, the
 * rest moved to their new time, the missing ones made. Sent, by-hand and skipped rows stay as they were.
 */
export async function rebuildReminders(tx: OrgTx, bookingId: string, now: Date): Promise<void> {
  const wanted = await wantedReminders(tx, bookingId, now);
  const keys = new Set(wanted.map((row) => row.key));
  const existing = await tx.bookingReminder.findMany({
    where: { bookingId },
    select: { id: true, key: true, status: true },
  });
  const stale = existing.filter((row) => row.status === "scheduled" && !keys.has(row.key)).map((row) => row.id);
  if (stale.length > 0) await tx.bookingReminder.deleteMany({ where: { id: { in: stale }, status: "scheduled" } });
  const known = new Set(existing.map((row) => row.key));
  for (const row of wanted) {
    if (known.has(row.key)) {
      await tx.bookingReminder.updateMany({
        where: { bookingId, key: row.key, status: "scheduled" },
        data: { sendAt: row.sendAt },
      });
    }
  }
  await tx.bookingReminder.createMany({
    data: wanted
      .filter((row) => !known.has(row.key))
      .map((row) => ({
        bookingId,
        kind: row.kind,
        installmentId: row.installmentId,
        key: row.key,
        sendAt: row.sendAt,
      })),
    skipDuplicates: true,
  });
}

/** Marks the booking's unsent reminders skipped (a cancellation), and cancels the tasks made for the by-hand ones. */
export async function skipUnsentReminders(tx: OrgTx, actor: Actor, bookingId: string, note: string, now: Date) {
  const open = await tx.bookingReminder.findMany({
    where: { bookingId, status: { in: ["scheduled", "by_hand"] } },
    select: { id: true, status: true, taskId: true },
  });
  await finishTasks(
    tx,
    actor,
    open.map((row) => row.taskId),
    "cancelled",
    now,
  );
  await tx.bookingReminder.updateMany({
    where: { id: { in: open.filter((row) => row.status === "scheduled").map((row) => row.id) } },
    data: { status: "skipped", note },
  });
}

export interface ReminderDependencies {
  db: Database;
  /** The web app's address, for the trip link. */
  appUrl: string;
  timeZone: (organizationId: string) => Promise<string>;
  /** The agency's name and the lead owner's, for the blanks. */
  names: (organizationId: string, ownerUserId: string | null) => Promise<Omit<FillContext, "payment">>;
}

const WORDS = {
  balance: (name: string, amount: string, link: string) =>
    `Hi ${name}, a reminder that the next payment for your trip is due soon. See what is due and pay by UPI here: ${link}`.replace(
      "{amount}",
      amount,
    ),
  details: (name: string, _amount: string, link: string) =>
    `Hi ${name}, please fill in each traveller's details and see your packing list here: ${link}`,
  reporting: (name: string, _amount: string, link: string) =>
    `Hi ${name}, your trip starts tomorrow. Where and when to report, and your driver's number, are here: ${link}`,
} as const;

const BY_HAND_TITLE = {
  balance: "Remind {name} about the payment due",
  details: "Remind {name} to fill in the travellers' details",
  reporting: "Remind {name} where to report tomorrow",
} as const;

/** Whether the person agreed to hear about their trip on WhatsApp: the newest trip-updates row of the ledger says granted. */
export async function tripUpdatesAgreed(tx: OrgTx, personId: string): Promise<boolean> {
  const latest = await tx.personConsent.findFirst({
    where: { personId, purpose: "trip_updates" },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    select: { action: true },
  });
  return latest?.action === "granted";
}

type DueRow = Awaited<ReturnType<typeof dueRows>>[number];

const dueRows = (tx: OrgTx, now: Date) =>
  tx.bookingReminder.findMany({
    where: {
      status: "scheduled",
      sendAt: { lte: now },
      booking: { status: "confirmed", remindersPausedAt: null, deletedAt: null },
    },
    orderBy: [{ sendAt: "asc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      kind: true,
      bookingId: true,
      installmentId: true,
      sendAt: true,
      booking: {
        select: {
          leadId: true,
          number: true,
          quoteId: true,
          startDate: true,
          reportingTime: true,
          reportingPlace: true,
          lead: { select: { ownerUserId: true, personId: true, person: { select: { name: true } } } },
        },
      },
    },
  });

/** Why a due reminder needs no sending any more, or null when it does. */
async function reasonToSkip(tx: OrgTx, row: DueRow): Promise<string | null> {
  if (row.kind === "balance") {
    const paid = await paidOnQuote(tx, row.booking.quoteId);
    const dues = await tx.quoteInstallment.findMany({
      where: { quoteId: row.booking.quoteId },
      select: { id: true, amountPaise: true, dueOn: true },
    });
    const due = coveredInstallments(
      dues.map((one) => ({ id: one.id, amountPaise: Number(one.amountPaise), dueOn: dayOf(one.dueOn) })),
      paid,
    ).find((one) => one.id === row.installmentId);
    return due === undefined || due.paid ? "paid" : null;
  }
  if (row.kind === "details") {
    const incomplete = await tx.bookingTraveller.count({ where: { bookingId: row.bookingId, completeAt: null } });
    return incomplete === 0 ? "complete" : null;
  }
  return row.booking.reportingPlace === "" && row.booking.reportingTime === null ? "no_essentials" : null;
}

/** One reminder: claimed, then sent or turned into a task. Returns whether a message was queued. */
async function sendOne(dependencies: ReminderDependencies, organizationId: string, id: string, now: Date) {
  const { db } = dependencies;
  return db.forOrg(organizationId, async (tx) => {
    // Locked and re-read, so two runs at once send one.
    await tx.$queryRaw`SELECT id FROM booking_reminder WHERE id = ${id}::uuid AND status = 'scheduled' FOR UPDATE SKIP LOCKED`;
    const row = (await dueRows(tx, now)).find((candidate) => candidate.id === id);
    if (row === undefined) return false;
    const actor = systemActor(organizationId);
    if (now.getTime() - row.sendAt.getTime() > STALE_AFTER) {
      await tx.bookingReminder.update({ where: { id }, data: { status: "skipped", note: "stale" } });
      return false;
    }
    const skip = await reasonToSkip(tx, row);
    if (skip !== null) {
      await tx.bookingReminder.update({ where: { id }, data: { status: "skipped", note: skip } });
      return false;
    }
    const settings = await bookingSettingsOf(tx);
    const kind = row.kind as keyof typeof WORDS;
    const { templateId, params } = {
      balance: { templateId: settings.balanceTemplateId, params: settings.balanceParams },
      details: { templateId: settings.detailsTemplateId, params: settings.detailsParams },
      reporting: { templateId: settings.reportingTemplateId, params: settings.reportingParams },
    }[kind];
    const agreed = await tripUpdatesAgreed(tx, row.booking.lead.personId);
    const name = row.booking.lead.person.name;
    let outcome: "sent" | "later" | "by_hand" = "by_hand";
    let note = agreed ? "no_template" : "no_consent";
    let messageId: string | null = null;
    if (agreed && templateId !== null) {
      const facts = await leadFacts(tx, row.booking.leadId);
      const names = await dependencies.names(organizationId, row.booking.lead.ownerUserId);
      const shared = await createShareLink(
        tx,
        actor,
        {
          recordType: QUOTE_RECORD_TYPE,
          recordId: row.booking.quoteId,
          label: `Trip ${row.booking.number}`,
          expiresAt: new Date(now.getTime() + 60 * DAY),
        },
        now,
      );
      const link = `${dependencies.appUrl.replace(/\/$/, "")}${shared.path}`;
      const due =
        row.installmentId === null
          ? null
          : await tx.quoteInstallment.findUnique({
              where: { id: row.installmentId },
              select: { amountPaise: true, dueOn: true },
            });
      const payment = {
        amountPaise: due === null ? 0 : Number(due.amountPaise),
        dueOn:
          due === null
            ? row.booking.startDate === null
              ? dayOf(now)
              : dayOf(row.booking.startDate)
            : dayOf(due.dueOn),
        link,
      };
      const first = facts?.firstName === undefined || facts.firstName === "" ? "there" : facts.firstName;
      const result =
        facts === null
          ? ({ kind: "never", reason: "no_lead" } as const)
          : await sendToLead(
              tx,
              {
                organizationId,
                leadId: row.booking.leadId,
                templateId,
                params: fillParams(params, facts, { ...names, payment }),
                sessionText: `${WORDS[kind](first, "", link)}\n\n${names.agencyName}`,
                agreed: true,
                clientToken: `booking-reminder:${id}`,
              },
              now,
            );
      if (result.kind === "sent") {
        outcome = "sent";
        messageId = result.messageId;
      } else if (result.kind === "later" && now.getTime() - row.sendAt.getTime() < GIVE_UP_AFTER) {
        outcome = "later";
      } else {
        note = result.reason;
      }
    }
    if (outcome === "later") return false;
    if (outcome === "sent") {
      await tx.bookingReminder.update({ where: { id }, data: { status: "sent", sentAt: now, messageId } });
      await recordBookingEvent(tx, actor, {
        leadId: row.booking.leadId,
        bookingId: row.bookingId,
        event: "reminder-sent",
      });
      return true;
    }
    const task = await createTask(tx, actor, {
      kind: "task",
      title: BY_HAND_TITLE[kind].replace("{name}", name).slice(0, 200),
      dueAt: now,
      assigneeUserId: row.booking.lead.ownerUserId,
      record: { recordType: "booking", recordId: row.bookingId },
    });
    await tx.bookingReminder.update({ where: { id }, data: { status: "by_hand", note, taskId: task.id } });
    await recordBookingEvent(tx, actor, {
      leadId: row.booking.leadId,
      bookingId: row.bookingId,
      event: "reminder-by-hand",
    });
    await recordAudit(tx, actor, {
      action: "booking.reminder-by-hand",
      entityType: "booking",
      entityId: row.bookingId,
      after: { kind: row.kind, reason: note },
    });
    return false;
  });
}

/** One agency's reminders now due. Returns how many messages were queued. */
export async function runBookingRemindersFor(
  dependencies: ReminderDependencies,
  organizationId: string,
  now: Date,
): Promise<number> {
  const timeZone = await dependencies.timeZone(organizationId);
  // Only in the agency's working hours (10:00 to 20:00); the reporting reminder at 18:00 is inside them.
  if (workingMoment(now, timeZone).getTime() !== now.getTime()) return 0;
  const ids = await dependencies.db.forOrg(organizationId, async (tx) => (await dueRows(tx, now)).map((row) => row.id));
  let sent = 0;
  for (const id of ids) if (await sendOne(dependencies, organizationId, id, now)) sent += 1;
  return sent;
}
