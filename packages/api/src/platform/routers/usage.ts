// How organizations use the product, for platform staff (the owner, 2026-10-28): every organization's time, sessions,
// members, leads and AI cost, and one organization's pages, members, days and sessions.
import { organizationUsage, organizationUsageInput, usageOverview } from "@travel-crm/contracts/platform";
import { organizationUsageOf, usageOverviewOf } from "@travel-crm/domain/platform";
import { staffProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const usageRouter = platformT.router({
  overview: staffProcedure
    .output(usageOverview)
    .query(({ ctx }) => usageOverviewOf(ctx.services, ctx.services.aiPrices ?? null)),
  organization: staffProcedure
    .input(organizationUsageInput)
    .output(organizationUsage)
    .query(({ ctx, input }) => organizationUsageOf(ctx.services, ctx.services.aiPrices ?? null, input.organizationId)),
});
