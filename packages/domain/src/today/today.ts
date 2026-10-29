// Today (spec 3.5): the signed-in person's own overdue and due-today follow-ups and tasks, their new leads waiting for a
// reply, the quotes customers opened and went quiet on and the payments falling due (release 5), counted for the day in
// the agency's zone (R35). Overdue is due before now; due today runs from now to
// the agency's next midnight, so yesterday's undone work is overdue at 00:05 and 00:10 tomorrow isn't today at 23:50.
import type { Task } from "@travel-crm/contracts/tasks";
import { todaySectionNames } from "@travel-crm/contracts/today";
import type {
  TodayItem,
  TodaySectionInput,
  TodaySectionName,
  TodaySectionPage,
  TodaySummary,
} from "@travel-crm/contracts/today";
import type { OrgTx } from "@travel-crm/db";
import { countNewLeadsWaiting, leadBriefs, newLeadsWaiting, type NewLeadWaiting } from "../crm/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { addDays, calendarDateIn, startOfDayIn, type CalendarDate } from "../kernel/index.js";
import { countOpenedQuotesNoReply, countPaymentsDue, openedQuotesNoReply, paymentsDue } from "../sales/index.js";
import { countOpenTasks, listOpenTasks } from "../tasks/index.js";

/** The agency's day at now, and the instant it ends: its next midnight. */
async function dayAt(tx: OrgTx, access: MemberAccess, now: Date): Promise<{ day: CalendarDate; endsAt: Date }> {
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const day = calendarDateIn(now, timeZone);
  return { day, endsAt: startOfDayIn(addDays(day, 1), timeZone) };
}

/** Each task with its lead in brief, when it is on a lead that is still there and the member may see. */
async function taskItems(tx: OrgTx, access: MemberAccess, tasks: Task[]): Promise<TodayItem[]> {
  const leadIdOf = (task: Task) => (task.record?.recordType === "lead" ? task.record.recordId : null);
  const leads = await leadBriefs(
    tx,
    access,
    tasks.flatMap((task) => leadIdOf(task) ?? []),
  );
  return tasks.map((task) => ({ kind: "task", task, lead: leads.get(leadIdOf(task) ?? "") ?? null }));
}

/** New leads in brief, each with the moment it came in. */
async function newLeadItems(tx: OrgTx, access: MemberAccess, waiting: NewLeadWaiting[]): Promise<TodayItem[]> {
  const leads = await leadBriefs(
    tx,
    access,
    waiting.map(({ leadId }) => leadId),
  );
  return waiting.flatMap(({ leadId, waitingSince }) => {
    const lead = leads.get(leadId);
    return lead === undefined ? [] : [{ kind: "new-lead" as const, lead, waitingSince: waitingSince.toISOString() }];
  });
}

/** Opened quotes the customer went quiet on, each with its lead in brief. */
async function openedQuoteItems(
  tx: OrgTx,
  access: MemberAccess,
  page: { after?: string | undefined; limit: number },
  now: Date,
): Promise<TodayItem[]> {
  const opened = await openedQuotesNoReply(tx, access, page, now);
  const leads = await leadBriefs(
    tx,
    access,
    opened.map(({ leadId }) => leadId),
  );
  return opened.flatMap((row) => {
    const lead = leads.get(row.leadId);
    return lead === undefined
      ? []
      : [
          {
            kind: "quote-opened" as const,
            lead,
            quote: { id: row.quoteId, title: row.title },
            opens: row.opens,
            lastOpenedAt: row.lastOpenedAt.toISOString(),
          },
        ];
  });
}

/** Payments due soon or missed, each with its lead in brief. */
async function paymentItems(
  tx: OrgTx,
  access: MemberAccess,
  page: { after?: string | undefined; limit: number },
  day: CalendarDate,
): Promise<TodayItem[]> {
  const due = await paymentsDue(tx, access, page, day);
  const leads = await leadBriefs(
    tx,
    access,
    due.map(({ leadId }) => leadId),
  );
  return due.flatMap((row) => {
    const lead = leads.get(row.leadId);
    return lead === undefined
      ? []
      : [
          {
            kind: "payment-due" as const,
            lead,
            installmentId: row.installmentId,
            quoteId: row.quoteId,
            amountPaise: row.amountPaise,
            dueOn: row.dueOn,
            missed: row.missed,
          },
        ];
  });
}

/** A section's items in order, up to the limit, after the cursor; due today ends at the agency's midnight, endsAt. */
async function sectionItems(
  tx: OrgTx,
  access: MemberAccess,
  page: { section: TodaySectionName; after?: string | undefined; limit: number },
  { now, endsAt, day }: { now: Date; endsAt: Date; day: CalendarDate },
): Promise<TodayItem[]> {
  const { section, after, limit } = page;
  const cursor = { limit, ...(after === undefined ? {} : { after }) };
  const assigneeUserId = access.userId;
  switch (section) {
    case "overdue":
      return taskItems(tx, access, await listOpenTasks(tx, { assigneeUserId, dueBefore: now, ...cursor }));
    case "new-leads":
      return newLeadItems(tx, access, await newLeadsWaiting(tx, { ownerUserId: access.userId, ...cursor }));
    case "payments-due":
      return paymentItems(tx, access, cursor, day);
    case "quote-opened":
      return openedQuoteItems(tx, access, cursor, now);
    case "due-today": {
      const dueToday = { assigneeUserId, dueFrom: now, dueBefore: endsAt, ...cursor };
      return taskItems(tx, access, await listOpenTasks(tx, dueToday));
    }
  }
}

function itemId(item: TodayItem): string {
  switch (item.kind) {
    case "task":
      return item.task.id;
    case "new-lead":
      return item.lead.id;
    case "quote-opened":
      return item.quote.id;
    case "payment-due":
      return item.installmentId;
  }
}

/** The day, the counts and the first of each section: overdue, payments due, the oldest new lead, a quote opened, due today. */
export async function todaySummary(tx: OrgTx, access: MemberAccess, now: Date): Promise<TodaySummary> {
  const { day, endsAt } = await dayAt(tx, access, now);
  const assigneeUserId = access.userId;
  const counts = {
    overdue: await countOpenTasks(tx, { assigneeUserId, dueBefore: now }),
    newLeads: await countNewLeadsWaiting(tx, access.userId),
    dueToday: await countOpenTasks(tx, { assigneeUserId, dueFrom: now, dueBefore: endsAt }),
    quoteOpened: await countOpenedQuotesNoReply(tx, access, now),
    paymentsDue: await countPaymentsDue(tx, access, day),
  };
  const top: TodayItem[] = [];
  for (const section of todaySectionNames) {
    top.push(...(await sectionItems(tx, access, { section, limit: 1 }, { now, endsAt, day })));
  }
  return { day, counts, top };
}

/** One section, a page at a time, after the previous page's last item. */
export async function todaySection(
  tx: OrgTx,
  access: MemberAccess,
  input: TodaySectionInput,
  now: Date,
): Promise<TodaySectionPage> {
  const { day, endsAt } = await dayAt(tx, access, now);
  // One more than a page says whether another page follows.
  const found = await sectionItems(tx, access, { ...input, limit: input.limit + 1 }, { now, endsAt, day });
  const items = found.slice(0, input.limit);
  const last = items.at(-1);
  return { items, nextCursor: found.length > input.limit && last !== undefined ? itemId(last) : null };
}
