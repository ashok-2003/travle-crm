// The fixed catalogue behind "ask your reports in plain words" (release ai2b). The AI sees only each entry's id, title and
// whether it takes a range; it never sees agency data. A report runs with the asker's own permissions and their scope, and
// one they may not run is not in the catalogue they are offered.
import type { AskRange, ReportAnswer, ReportQueryId } from "@travel-crm/contracts/reports";
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { calendarDateIn, DomainError } from "../../kernel/index.js";
import { periodOf } from "../report.js";
import { overview, leadsByDestination, leadsBySource, leadsByStage, lostLeads } from "./leads.js";
import { paymentsCollected, paymentsDue, quotes } from "./money.js";
import { DEFAULT_ASK_RANGE, daysOfRange } from "./range.js";
import { followUpsOverdue, team } from "./team.js";
import type { ReportQuery } from "./types.js";

const catalogue: readonly ReportQuery[] = [
  overview,
  team,
  leadsBySource,
  leadsByDestination,
  leadsByStage,
  lostLeads,
  quotes,
  paymentsCollected,
  paymentsDue,
  followUpsOverdue,
];

const seesAll = (access: MemberAccess) => access.permissions.scopeOf("leads:view") === "all";

/** The reports this member may run: every permission held, and the team's only for a role that sees every lead. */
export function reportsFor(access: MemberAccess): readonly Pick<ReportQuery, "id" | "title" | "ranged">[] {
  return catalogue
    .filter((entry) => entry.requires.every((permission) => access.permissions.has(permission)))
    .filter((entry) => entry.allOnly !== true || seesAll(access))
    .map(({ id, title, ranged }) => ({ id, title, ranged }));
}

/** Runs one report for the asker, in the agency's zone. A report they may not run is "not found". */
export async function runReport(
  tx: OrgTx,
  access: MemberAccess,
  input: { queryId: ReportQueryId; range?: AskRange | undefined },
  now: Date,
): Promise<ReportAnswer> {
  const entry = catalogue.find((one) => one.id === input.queryId);
  if (entry === undefined || !reportsFor(access).some((one) => one.id === entry.id)) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  }
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const range = entry.ranged ? (input.range ?? DEFAULT_ASK_RANGE) : null;
  const days = daysOfRange(range ?? DEFAULT_ASK_RANGE, calendarDateIn(now, timeZone));
  const period = periodOf(days.first, days.last, timeZone);
  const result = await entry.run(tx, access, {
    now,
    period,
    owner: seesAll(access) ? null : access.userId,
    showsMoney: access.permissions.has("money:view_reports"),
  });
  return {
    queryId: entry.id,
    range,
    from: range === null ? null : days.first,
    to: range === null ? null : days.last,
    ...result,
  };
}
