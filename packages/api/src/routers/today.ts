// today.*: the signed-in person's day (spec 3.5): its counts and top three, and each section a page at a time. Needs
// leads:view (R20); always the person's own items, whatever their scope (R35).
import {
  dismissQuoteOpenedInput,
  todaySectionInput,
  todaySectionPage,
  todaySummary as todaySummaryOutput,
} from "@travel-crm/contracts/today";
import { dismissOpenedQuote } from "@travel-crm/domain/sales";
import { todaySection, todaySummary } from "@travel-crm/domain/today";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = orgProcedure.requires("leads:view");
const editor = orgProcedure.requires("leads:edit");

export const todayRouter = router({
  summary: viewer
    .output(todaySummaryOutput)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => todaySummary(tx, ctx.member, new Date()))),

  section: viewer
    .input(todaySectionInput)
    .output(todaySectionPage)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => todaySection(tx, ctx.member, input, new Date())),
    ),

  /** "Done" on a quote the customer opened and went quiet on: its opens so far no longer bring it back. */
  dismissQuoteOpened: editor.input(dismissQuoteOpenedInput).mutation(async ({ ctx, input }) => {
    await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
      dismissOpenedQuote(tx, ctx.member, input.leadId, new Date()),
    );
  }),
});
