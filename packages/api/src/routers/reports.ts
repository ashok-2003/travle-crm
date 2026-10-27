// reports.*: reports and analytics (sales execution): the period's report (the agency's, with its team, for a role that
// sees every lead; else the member's own) and one staff member's performance and activity. Names come from identity.
import { reportInput, salesReport, staffReport, staffReportInput } from "@travel-crm/contracts/reports";
import { salesReportOf, staffReportOf } from "@travel-crm/domain/reports";
import { memberNames } from "../member-names.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = orgProcedure.requires("leads:view");

export const reportsRouter = router({
  overview: viewer
    .input(reportInput)
    .output(salesReport)
    .query(async ({ ctx, input }) => {
      const figures = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        salesReportOf(tx, ctx.member, input.range, new Date()),
      );
      const names = await memberNames(
        ctx.identity,
        ctx.member.organizationId,
        figures.team.map((row) => row.userId),
      );
      return { ...figures, team: figures.team.map((row) => ({ ...row, name: names[row.userId] ?? null })) };
    }),

  staff: viewer
    .input(staffReportInput)
    .output(staffReport)
    .query(async ({ ctx, input }) => {
      const figures = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        staffReportOf(tx, ctx.member, input, new Date()),
      );
      const names = await memberNames(ctx.identity, ctx.member.organizationId, [input.userId]);
      return { ...figures, person: { ...figures.person, name: names[input.userId] ?? null } };
    }),
});
