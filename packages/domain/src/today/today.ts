// Today (spec 3.5): the signed-in person's own overdue and due-today follow-ups and tasks and their new leads waiting
// for a reply, counted for the day in the agency's zone (R35). Overdue is due before now; due today runs from now to
// the agency's next midnight, so yesterday's undone work is overdue at 00:05 and 00:10 tomorrow isn't today at 23:50.
import type { Task } from "@travel-crm/contracts/tasks";
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
import { countOpenTasks, listOpenTasks } from "../tasks/index.js";

/** The agency's day at now, and the instant it ends: its next midnight. */
async function dayAt(tx: OrgTx, access: MemberAccess, now: Date): Promise<{ day: CalendarDate; endsAt: Date }> {
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const day = calendarDateIn(now, timeZone);
  return { day, endsAt: startOfDayIn(addDays(day, 1), timeZone) };
}

/** Each task with its lead in brief, when it is on a lead that is still there. */
async function taskItems(tx: OrgTx, tasks: Task[]): Promise<TodayItem[]> {
  const leadIdOf = (task: Task) => (task.record?.recordType === "lead" ? task.record.recordId : null);
  const leads = await leadBriefs(
    tx,
    tasks.flatMap((task) => leadIdOf(task) ?? []),
  );
  return tasks.map((task) => ({ kind: "task", task, lead: leads.get(leadIdOf(task) ?? "") ?? null }));
}

/** New leads in brief, each with the moment it came in. */
async function newLeadItems(tx: OrgTx, waiting: NewLeadWaiting[]): Promise<TodayItem[]> {
  const leads = await leadBriefs(
    tx,
    waiting.map(({ leadId }) => leadId),
  );
  return waiting.flatMap(({ leadId, waitingSince }) => {
    const lead = leads.get(leadId);
    return lead === undefined ? [] : [{ kind: "new-lead" as const, lead, waitingSince: waitingSince.toISOString() }];
  });
}

/** A section's items in order, up to the limit, after the cursor. */
async function sectionItems(
  tx: OrgTx,
  access: MemberAccess,
  page: { section: TodaySectionName; after?: string | undefined; limit: number },
  now: Date,
): Promise<TodayItem[]> {
  const { section, after, limit } = page;
  const cursor = { limit, ...(after === undefined ? {} : { after }) };
  const assigneeUserId = access.userId;
  switch (section) {
    case "overdue":
      return taskItems(tx, await listOpenTasks(tx, { assigneeUserId, dueBefore: now, ...cursor }));
    case "new-leads":
      return newLeadItems(tx, await newLeadsWaiting(tx, { ownerUserId: access.userId, ...cursor }));
    case "due-today": {
      const { endsAt } = await dayAt(tx, access, now);
      return taskItems(tx, await listOpenTasks(tx, { assigneeUserId, dueFrom: now, dueBefore: endsAt, ...cursor }));
    }
  }
}

const itemId = (item: TodayItem) => (item.kind === "task" ? item.task.id : item.lead.id);

/** The day, the three counts and the top three: the first overdue, the oldest new lead, the next due today. */
export async function todaySummary(tx: OrgTx, access: MemberAccess, now: Date): Promise<TodaySummary> {
  const { day, endsAt } = await dayAt(tx, access, now);
  const assigneeUserId = access.userId;
  const counts = {
    overdue: await countOpenTasks(tx, { assigneeUserId, dueBefore: now }),
    newLeads: await countNewLeadsWaiting(tx, access.userId),
    dueToday: await countOpenTasks(tx, { assigneeUserId, dueFrom: now, dueBefore: endsAt }),
  };
  const top: TodayItem[] = [];
  for (const section of ["overdue", "new-leads", "due-today"] as const) {
    top.push(...(await sectionItems(tx, access, { section, limit: 1 }, now)));
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
  // One more than a page says whether another page follows.
  const found = await sectionItems(tx, access, { ...input, limit: input.limit + 1 }, now);
  const items = found.slice(0, input.limit);
  const last = items.at(-1);
  return { items, nextCursor: found.length > input.limit && last !== undefined ? itemId(last) : null };
}
