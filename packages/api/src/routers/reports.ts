// reports.*: reports and analytics (sales execution): the period's report (the agency's, with its team, for a role that
// sees every lead; else the member's own) and one staff member's performance and activity. Names come from identity.
import {
  askedReport,
  askReportInput,
  reportAnswer,
  reportInput,
  runReportInput,
  salesReport,
  staffReport,
  staffReportInput,
  type ReportAnswer,
} from "@travel-crm/contracts/reports";
import { chooseReport } from "@travel-crm/domain/ai";
import { DomainError } from "@travel-crm/domain/kernel";
import { reportsFor, runReport, salesReportOf, staffReportOf } from "@travel-crm/domain/reports";
import { memberNames } from "../member-names.js";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/** A report's `person` cells hold user ids; they are shown by name ("" for someone no longer on the staff). */
async function named(
  ctx: { identity: Parameters<typeof memberNames>[0]; member: { organizationId: string } },
  answer: ReportAnswer,
): Promise<ReportAnswer> {
  const keys = answer.columns.filter((column) => column.kind === "person").map((column) => column.key);
  if (keys.length === 0) return answer;
  const ids = answer.rows.flatMap((row) => keys.map((key) => row[key])).filter((id) => typeof id === "string");
  const names = await memberNames(ctx.identity, ctx.member.organizationId, ids);
  return {
    ...answer,
    rows: answer.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, cell]) => [key, keys.includes(key) ? (names[String(cell)] ?? "") : cell]),
      ),
    ),
  };
}

// Money and what staff did are read from the database, never the five-minute session cache (an exports-grade read).
const viewer = freshProcedure.requires("leads:view");

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

  /** A report of the fixed catalogue, run again for another range: no AI, no call. */
  run: viewer
    .input(runReportInput)
    .output(reportAnswer)
    .query(async ({ ctx, input }) =>
      named(ctx, await ctx.db.forOrg(ctx.member.organizationId, (tx) => runReport(tx, ctx.member, input, new Date()))),
    ),

  /**
   * A question in words: the AI picks the report and its range (it sees only the question and the catalogue), then the
   * report runs with the asker's own permissions and scope. A mutation because it spends one of the agency's AI calls.
   */
  ask: freshProcedure
    .requires("ai:suggest", "leads:view")
    .input(askReportInput)
    .output(askedReport)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      const now = new Date();
      const catalogue = reportsFor(ctx.member);
      const { chosen, usedThisMonth, monthlyLimit } = await chooseReport(
        ctx.db,
        ctx.ai,
        ctx.member,
        input.question,
        catalogue,
        now,
      );
      if (chosen.kind === "cannot") {
        // The three nearest, filled up from the reports every member has when the AI named fewer.
        const fallback = ["overview", "leads_by_source", "quotes"] as const;
        const allowed = fallback.filter((id) => catalogue.some((entry) => entry.id === id));
        const suggestions = [...new Set([...chosen.closest, ...allowed])].slice(0, 3);
        return { kind: "declined" as const, suggestions, usedThisMonth, monthlyLimit };
      }
      const answer = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        runReport(tx, ctx.member, { queryId: chosen.queryId, range: chosen.range ?? undefined }, now),
      );
      return { kind: "answer" as const, answer: await named(ctx, answer), usedThisMonth, monthlyLimit };
    }),
});
