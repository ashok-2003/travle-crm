// Reports and analytics (sales execution): the period's report, and one staff member's. A role that sees every lead
// (leads:view "all") sees the agency and its team, and anyone's own report; anyone else their own leads and their own
// report alone (another's is "not found"). The period is the dashboard's (7, 30, 90 days or this month), in the agency's
// zone, compared against the period just before, as long. Names are the router's, from identity.
import type { DashboardRange } from "@travel-crm/contracts/insights";
import type { SalesReport, StaffReport, TeamRow } from "@travel-crm/contracts/reports";
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { addDays, calendarDateIn, DomainError, startOfDayIn, type CalendarDate } from "../kernel/index.js";
import { daysOf, periodDays } from "../insights/index.js";
import { breakdownsOf } from "./breakdowns.js";
import { figuresOf, type ReportPeriod } from "./figures.js";
import { perDayOf, teamRowsOf } from "./team.js";

type Unnamed<T> = T extends { name: string | null } ? Omit<T, "name"> : T;
export type SalesReportFigures = Omit<SalesReport, "team"> & { team: Unnamed<TeamRow>[] };
export type StaffReportFigures = Omit<StaffReport, "person"> & { person: Unnamed<TeamRow> };

function periodOf(first: CalendarDate, last: CalendarDate, timeZone: string): ReportPeriod {
  return {
    from: startOfDayIn(first, timeZone),
    to: startOfDayIn(addDays(last, 1), timeZone),
    firstDay: first,
    lastDay: last,
    timeZone,
  };
}

async function periodsOf(tx: OrgTx, access: MemberAccess, range: DashboardRange, now: Date) {
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const days = periodDays(range, calendarDateIn(now, timeZone));
  const length = daysOf(days).length;
  return {
    days,
    current: periodOf(days.first, days.last, timeZone),
    previous: periodOf(addDays(days.first, -length), addDays(days.first, -1), timeZone),
  };
}

const seesAll = (access: MemberAccess) => access.permissions.scopeOf("leads:view") === "all";

export async function salesReportOf(
  tx: OrgTx,
  access: MemberAccess,
  range: DashboardRange,
  now: Date,
): Promise<SalesReportFigures> {
  const all = seesAll(access);
  const owner = all ? null : access.userId;
  const { days, current, previous } = await periodsOf(tx, access, range, now);
  const team = all ? await teamRowsOf(tx, current, now) : [];
  return {
    scope: all ? "all" : "own",
    from: days.first,
    to: days.last,
    figures: await figuresOf(tx, owner, current),
    previous: await figuresOf(tx, owner, previous),
    ...(await breakdownsOf(tx, owner, current)),
    team: team.sort((a, b) => b.salesPaise - a.salesPaise || b.won - a.won || b.leads - a.leads),
  };
}

export async function staffReportOf(
  tx: OrgTx,
  access: MemberAccess,
  input: { userId: string; range: DashboardRange },
  now: Date,
): Promise<StaffReportFigures> {
  if (!seesAll(access) && input.userId !== access.userId) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  }
  const { days, current } = await periodsOf(tx, access, input.range, now);
  const [person] = await teamRowsOf(tx, current, now, input.userId);
  const team = await teamRowsOf(tx, current, now);
  const leads = team.reduce((sum, row) => sum + row.leads, 0);
  const won = team.reduce((sum, row) => sum + row.won, 0);
  const replies = team.flatMap((row) => (row.medianFirstReplyMinutes === null ? [] : [row.medianFirstReplyMinutes]));
  const sellers = team.filter((row) => row.leads > 0 || row.salesPaise > 0);
  const activity = await tx.auditEntry.findMany({
    where: { actorUserId: input.userId },
    orderBy: { occurredAt: "desc" },
    take: 40,
    select: { action: true, entityType: true, entityId: true, occurredAt: true },
  });
  const lastMessage = await tx.whatsappMessage.findFirst({
    where: { sentBy: input.userId, direction: "out" },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  const lastSeen = [activity[0]?.occurredAt, lastMessage?.occurredAt]
    .filter((at): at is Date => at !== undefined)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    from: days.first,
    to: days.last,
    person: person ?? {
      userId: input.userId,
      leads: 0,
      contacted: 0,
      quotesSent: 0,
      won: 0,
      lost: 0,
      salesPaise: 0,
      collectedPaise: 0,
      medianFirstReplyMinutes: null,
      messages: 0,
      notes: 0,
      tasksDone: 0,
      overdue: 0,
      openLeads: 0,
    },
    teamAverage: {
      conversionPercent: leads === 0 ? null : (won * 100) / leads,
      medianFirstReplyMinutes:
        replies.length === 0 ? null : ([...replies].sort((a, b) => a - b)[Math.floor(replies.length / 2)] ?? null),
      salesPaise:
        sellers.length === 0 ? 0 : Math.round(sellers.reduce((sum, row) => sum + row.salesPaise, 0) / sellers.length),
    },
    perDay: await perDayOf(tx, input.userId, current, daysOf(days)),
    activity: activity.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
    lastActiveAt: lastSeen?.toISOString() ?? null,
  };
}
