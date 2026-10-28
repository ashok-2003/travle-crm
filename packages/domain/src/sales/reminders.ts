// Payment reminders (sales execution, closing): for each payment due on an accepted quote and not yet covered by what was
// paid, the customer is reminded on WhatsApp some days before (the agency's setting) and once the day after it is missed,
// with the amount, the day and the quote's link, where they pay the agency by UPI. Inside the 24-hour window it is a
// plain message; outside it, the agency's reminder template. The owner is told too. Only between 10:00 and 20:00 in the
// agency's zone; each reminder's key makes it once.
import type { OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import { addDays, calendarDateIn, formatMoney, money, systemActor, type CalendarDate } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { coveredInstallments } from "../quotes/index.js";
import { createShareLink } from "../share-links/index.js";
import { runFollowUpsFor, workingMoment, type CadenceDependencies } from "./cadence.js";
import { fillParams, leadFacts } from "./fill-params.js";
import { claimTouch, recordTouch, releaseTouch, sendToLead, touchTaken } from "./send.js";
import { salesAutomationOf } from "./settings.js";

export const PAYMENT_DUE_KIND = "sales.payment-due";
const DAY = 24 * 3_600_000;
const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export interface ReminderDependencies extends CadenceDependencies {
  /** Where the web app is, for the quote's link: https://app.example.com. */
  appUrl: string;
}

interface DueReminder {
  key: string;
  late: boolean;
  quoteId: string;
  leadId: string;
  title: string;
  ownerUserId: string | null;
  customerName: string;
  amountPaise: number;
  dueOn: string;
}

/** The reminders due today: before the day by the agency's days, and the day after a missed one. */
async function dueReminders(tx: OrgTx, today: CalendarDate, daysBefore: number): Promise<DueReminder[]> {
  const soon = addDays(today, daysBefore);
  const yesterday = addDays(today, -1);
  const quotes = await tx.quote.findMany({
    where: {
      status: "accepted",
      installments: {
        some: { dueOn: { in: [new Date(`${soon}T00:00:00Z`), new Date(`${yesterday}T00:00:00Z`)] } },
      },
    },
    select: {
      id: true,
      leadId: true,
      title: true,
      lead: { select: { ownerUserId: true, person: { select: { name: true } } } },
      installments: { select: { id: true, amountPaise: true, dueOn: true } },
      payments: { where: { voidedAt: null }, select: { amountPaise: true } },
    },
    take: 200,
  });
  const due: DueReminder[] = [];
  for (const quote of quotes) {
    const paid = quote.payments.reduce((sum, payment) => sum + Number(payment.amountPaise), 0);
    const covered = coveredInstallments(
      quote.installments.map((row) => ({
        id: row.id,
        amountPaise: Number(row.amountPaise),
        dueOn: row.dueOn.toISOString().slice(0, 10),
      })),
      paid,
    );
    for (const installment of covered) {
      if (installment.paid || (installment.dueOn !== soon && installment.dueOn !== yesterday)) continue;
      const late = installment.dueOn === yesterday;
      due.push({
        key: `reminder:${installment.id}:${late ? "late" : "before"}`,
        late,
        quoteId: quote.id,
        leadId: quote.leadId,
        title: quote.title,
        ownerUserId: quote.lead.ownerUserId,
        customerName: quote.lead.person.name,
        amountPaise: installment.amountPaise,
        dueOn: installment.dueOn,
      });
    }
  }
  return due;
}

export async function runRemindersFor(
  dependencies: ReminderDependencies,
  organizationId: string,
  now: Date,
): Promise<number> {
  const { db } = dependencies;
  const timeZone = await dependencies.timeZone(organizationId);
  if (workingMoment(now, timeZone).getTime() !== now.getTime()) return 0;
  const today = calendarDateIn(now, timeZone);
  const plan = await db.forOrg(organizationId, async (tx) => {
    const settings = await salesAutomationOf(tx);
    if (!settings.reminderEnabled) return null;
    const due = await dueReminders(tx, today, settings.reminderDaysBefore);
    const fresh: DueReminder[] = [];
    for (const reminder of due) if (!(await touchTaken(tx, reminder.key))) fresh.push(reminder);
    return { settings, due: fresh.slice(0, 20) };
  });
  if (plan === null) return 0;
  let sent = 0;
  for (const reminder of plan.due) {
    const facts = await db.forOrg(organizationId, (tx) => leadFacts(tx, reminder.leadId));
    if (facts === null) continue;
    const names = await dependencies.names(organizationId, facts.ownerUserId);
    await db.forOrg(organizationId, async (tx) => {
      if (!(await claimTouch(tx, { kind: "reminder", key: reminder.key, leadId: reminder.leadId }))) return;
      const actor = systemActor(organizationId);
      const shared = await createShareLink(
        tx,
        actor,
        {
          recordType: "quote",
          recordId: reminder.quoteId,
          label: `Quote: ${reminder.title}`.slice(0, 120),
          expiresAt: new Date(now.getTime() + 30 * DAY),
        },
        now,
      );
      const link = `${dependencies.appUrl.replace(/\/$/, "")}${shared.path}`;
      const amount = formatMoney(money(reminder.amountPaise));
      const day = dayWords.format(new Date(`${reminder.dueOn}T00:00:00Z`));
      const words = reminder.late
        ? `Hi ${facts.firstName || "there"}, a gentle reminder: ${amount} for ${reminder.title} was due on ${day}. You can pay by UPI here: ${link}`
        : `Hi ${facts.firstName || "there"}, a gentle reminder: ${amount} for ${reminder.title} is due by ${day}. You can pay by UPI here: ${link}`;
      const result = await sendToLead(
        tx,
        {
          organizationId,
          leadId: reminder.leadId,
          templateId: plan.settings.reminderTemplateId,
          params: fillParams(plan.settings.reminderParams, facts, {
            ...names,
            payment: { amountPaise: reminder.amountPaise, dueOn: reminder.dueOn, link },
          }),
          sessionText: `${words}\n\n${names.agencyName}`,
          clientToken: reminder.key,
        },
        now,
      );
      // A reminder that can't go now is tried in the next minute; one that never can is recorded and left.
      if (result.kind === "later") {
        await releaseTouch(tx, reminder.key);
        return;
      }
      await recordTouch(tx, reminder, result);
      if (result.kind === "sent") sent += 1;
      if (reminder.ownerUserId !== null) {
        await notify(tx, actor, {
          recipientUserIds: [reminder.ownerUserId],
          sourceEventId: noticeKey(reminder.key, PAYMENT_DUE_KIND),
          kind: PAYMENT_DUE_KIND,
          title: reminder.late
            ? `${reminder.customerName} missed a payment of ${amount}`
            : `${reminder.customerName} has ${amount} due by ${day}`,
          body:
            result.kind === "sent"
              ? "We reminded them on WhatsApp with the quote's link."
              : "We couldn't remind them on WhatsApp. Call them.",
          link: `/quotes/${reminder.quoteId}`,
          channels: ["push"],
        });
      }
    });
  }
  return sent;
}

/** Every automatic sales step an agency has due now: its follow-ups and its payment reminders. */
export async function runSalesDueWorkFor(
  dependencies: ReminderDependencies,
  organizationId: string,
  now: Date,
): Promise<number> {
  return (
    (await runFollowUpsFor(dependencies, organizationId, now)) +
    (await runRemindersFor(dependencies, organizationId, now))
  );
}
