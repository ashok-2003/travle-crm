// insights.*: the dashboard (release B): how leads did over a period, the person's own or, for a role that sees
// everyone's, the agency's with its team. Needs leads:view; the team's names come from identity, asked after the
// figures' transaction (never one forOrg inside another).
import { dashboard, dashboardInput } from "@travel-crm/contracts/insights";
import { dashboardFigures } from "@travel-crm/domain/insights";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const insightsRouter = router({
  dashboard: orgProcedure
    .requires("leads:view")
    .input(dashboardInput)
    .output(dashboard)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const figures = await ctx.db.forOrg(organizationId, (tx) =>
        dashboardFigures(tx, ctx.member, input.range, new Date()),
      );
      if (figures.team.length === 0) return { ...figures, team: [] };
      const names = new Map(
        (await ctx.identity.leadWorkers(organizationId)).map((worker) => [worker.userId, worker.name]),
      );
      return { ...figures, team: figures.team.map((row) => ({ ...row, name: names.get(row.userId) ?? null })) };
    }),
});
