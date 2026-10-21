// The dashboard (release B): how leads did over a period, in the agency's zone. A role that sees everyone's leads
// (leads:view "all") sees the agency and its team; anyone else their own leads, and their own overdue work. Names are
// not here: the team's come from identity, which the router asks after this transaction.
import type { Dashboard, DashboardRange } from "@travel-crm/contracts/insights";
import type { OrgTx } from "@travel-crm/db";
import { leadInsights } from "../crm/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { addDays, calendarDateIn, startOfDayIn } from "../kernel/index.js";
import { countOverdueTasks } from "../tasks/index.js";
import { daysOf, periodDays } from "./period.js";

/** The dashboard, with the team's people by id: Dashboard but for their names. */
export type DashboardFigures = Omit<Dashboard, "team"> & { team: Omit<Dashboard["team"][number], "name">[] };

export async function dashboardFigures(
  tx: OrgTx,
  access: MemberAccess,
  range: DashboardRange,
  now: Date,
): Promise<DashboardFigures> {
  const scope = access.permissions.scopeOf("leads:view") === "all" ? "all" : "own";
  const ownerUserId = scope === "all" ? null : access.userId;
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const days = periodDays(range, calendarDateIn(now, timeZone));
  const insights = await leadInsights(tx, ownerUserId, {
    from: startOfDayIn(days.first, timeZone),
    to: startOfDayIn(addDays(days.last, 1), timeZone),
    timeZone,
  });
  // The period just before, as many days long, for each figure's rise or fall.
  const length = daysOf(days).length;
  const before = await leadInsights(tx, ownerUserId, {
    from: startOfDayIn(addDays(days.first, -length), timeZone),
    to: startOfDayIn(days.first, timeZone),
    timeZone,
  });
  const leadsOn = new Map(insights.perDay.map((row) => [row.day, row.leads]));
  return {
    scope,
    from: days.first,
    to: days.last,
    totals: {
      newLeads: insights.newLeads,
      contacted: insights.contacted,
      medianFirstReplyMinutes: insights.medianFirstReplyMinutes,
      quotesSent: insights.quotesSent,
      won: insights.won,
      newLeadsWon: insights.newLeadsWon,
      open: insights.open,
      overdue: await countOverdueTasks(tx, { assigneeUserId: ownerUserId, now }),
    },
    previous: {
      newLeads: before.newLeads,
      contacted: before.contacted,
      medianFirstReplyMinutes: before.medianFirstReplyMinutes,
      quotesSent: before.quotesSent,
      won: before.won,
      newLeadsWon: before.newLeadsWon,
    },
    perDay: daysOf(days).map((day) => ({ day, leads: leadsOn.get(day) ?? 0 })),
    bySource: insights.bySource,
    byStage: insights.byStage,
    topDestinations: insights.topDestinations,
    responseTimes: insights.responseTimes,
    team: insights.team,
  };
}
