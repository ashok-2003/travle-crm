// Reports and analytics (sales execution): the period's report, and one staff member's. A role that sees every lead
// (leads:view "all") sees the agency and its team, and anyone's own report; anyone else their own leads and their own
// report alone (another's is "not found"). The period is the dashboard's (7, 30, 90 days or this month), in the agency's
// zone, compared against the period just before, as long. Names are the router's, from identity. What the agency sold and
// was paid is shown only to whoever holds money:view_reports (the rest are 0 and `showsMoney` is false); another
// member's recent actions need audit:view; the team's averages are the agency's, so only for a role that sees all.
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
const showsMoney = (access: MemberAccess) => access.permissions.has("money:view_reports");

/** The report with every amount of money taken out: what a member without the money permission is shown. */
function withoutMoney<Report extends SalesReportFigures>(report: Report): Report {
  const blank = <Figures extends { salesPaise: number; collectedPaise: number }>(figures: Figures): Figures => ({
    ...figures,
    salesPaise: 0,
    collectedPaise: 0,
  });
  return {
    ...report,
    figures: blank(report.figures),
    previous: blank(report.previous),
    pipelinePaise: 0,
    bySource: report.bySource.map((row) => ({ ...row, salesPaise: 0 })),
    byDestination: report.byDestination.map((row) => ({ ...row, salesPaise: 0 })),
    months: report.months.map((row) => ({ ...row, salesPaise: 0 })),
    team: report.team.map(blank),
  };
}

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
  const report: SalesReportFigures = {
    showsMoney: showsMoney(access),
    scope: all ? "all" : "own",
    from: days.first,
    to: days.last,
    figures: await figuresOf(tx, owner, current),
    previous: await figuresOf(tx, owner, previous),
    ...(await breakdownsOf(tx, owner, current)),
    team,
  };
  // Sorted after the money is blanked, so a member without it can't read the order of who sold most.
  const shown = report.showsMoney ? report : withoutMoney(report);
  return {
    ...shown,
    team: [...shown.team].sort((a, b) => b.salesPaise - a.salesPaise || b.won - a.won || b.leads - a.leads),
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
  const all = seesAll(access);
  const [person] = await teamRowsOf(tx, current, now, input.userId);
  // The agency's averages are not for a member who sees only their own leads: they would read the whole team's figures.
  const team = all ? await teamRowsOf(tx, current, now) : [];
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
  const mayReadAudit = access.permissions.has("audit:view");
  const money = showsMoney(access);
  const lastMessage = await tx.whatsappMessage.findFirst({
    where: { sentBy: input.userId, direction: "out" },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  const lastSeen = [activity[0]?.occurredAt, lastMessage?.occurredAt]
    .filter((at): at is Date => at !== undefined)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const row: Unnamed<TeamRow> = person ?? {
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
  };
  return {
    showsMoney: money,
    from: days.first,
    to: days.last,
    person: money ? row : { ...row, salesPaise: 0, collectedPaise: 0 },
    teamAverage: !all
      ? null
      : {
          conversionPercent: leads === 0 ? null : (won * 100) / leads,
          medianFirstReplyMinutes:
            replies.length === 0 ? null : ([...replies].sort((a, b) => a - b)[Math.floor(replies.length / 2)] ?? null),
          salesPaise:
            !money || sellers.length === 0
              ? 0
              : Math.round(sellers.reduce((sum, r) => sum + r.salesPaise, 0) / sellers.length),
        },
    perDay: await perDayOf(tx, input.userId, current, daysOf(days)),
    // What someone did is the audit log's to show, to whoever may read it.
    activity: mayReadAudit ? activity.map((entry) => ({ ...entry, occurredAt: entry.occurredAt.toISOString() })) : [],
    lastActiveAt: lastSeen?.toISOString() ?? null,
  };
}
