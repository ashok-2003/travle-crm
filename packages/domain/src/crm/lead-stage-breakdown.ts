// Leads by stage for a period (Home's card): the leads that came in during it, in the list's own scope, so a
// salesperson sees only their own. Not a lead is counted apart and left out of the total.
import { leadStage, type StageBreakdown } from "@travel-crm/contracts/crm";
import type { Period } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { periodStart } from "../kernel/index.js";
import { filterFor } from "./lead-list.js";
import { leadStageCountsQuery } from "./lead-list-query.js";

export async function stageBreakdownOf(
  tx: OrgTx,
  access: MemberAccess,
  period: Period,
  now: Date,
): Promise<StageBreakdown> {
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const start = periodStart(period, now, timeZone);
  const filter = filterFor(access, { view: "everyone" }, start ?? undefined);
  const rows = await tx.$queryRaw<{ stage: string; n: number }[]>(leadStageCountsQuery(filter));
  const stages: StageBreakdown["stages"] = {
    new: 0,
    contacted: 0,
    quote_sent: 0,
    booking_requested: 0,
    won: 0,
    lost: 0,
    not_a_lead: 0,
  };
  for (const { stage, n } of rows) stages[leadStage.parse(stage)] = n;
  return { total: Object.values(stages).reduce((sum, n) => sum + n, 0) - stages.not_a_lead, stages };
}
