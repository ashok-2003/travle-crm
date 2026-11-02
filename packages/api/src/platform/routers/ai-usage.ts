// The console's AI usage (the owner, 2026-11-02): the totals, costs, days, features, models and each agency's state, and
// every call one by one. Platform staff of either level may look.
import { aiCallsPage, aiOverview, listAiCallsInput } from "@travel-crm/contracts/platform";
import { aiOverviewOf, listAiCalls } from "@travel-crm/domain/platform";
import { staffProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const aiUsageRouter = platformT.router({
  overview: staffProcedure.output(aiOverview).query(({ ctx }) => aiOverviewOf(ctx.services)),
  /** The calls, newest first, a page at a time; for one agency, or only the failed. */
  calls: staffProcedure
    .input(listAiCallsInput)
    .output(aiCallsPage)
    .query(({ ctx, input }) => listAiCalls(ctx.services, input)),
});
