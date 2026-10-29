// finance.*: the agency's money (step 6, P0) for whoever keeps its accounts: the summary (revenue, costs, profit, what is
// owed either way), the bookings with their profit, a booking's supplier costs, and the running costs. Every change is
// money, so it comes from a session read afresh.
import {
  addExpenseInput,
  addTripCostInput,
  bookingCosts,
  bookingPage,
  bookingsInput,
  expenseIdInput,
  expenseList,
  financePeriodInput,
  financeSummary,
  markTripCostPaidInput,
  quoteCostsInput,
  tripCostIdInput,
} from "@travel-crm/contracts/finance";
import {
  addExpense,
  addTripCost,
  bookingCostsOf,
  financeSummaryOf,
  listBookings,
  listExpenses,
  markTripCostPaid,
  voidExpense,
  voidTripCost,
} from "@travel-crm/domain/finance";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = freshProcedure.requires("accounts:view");
const adder = freshProcedure.requires("accounts:create");
const editor = freshProcedure.requires("accounts:edit");

export const financeRouter = router({
  summary: viewer
    .input(financePeriodInput)
    .output(financeSummary)
    .query(async ({ ctx, input }) => {
      const timeZone = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.timeZone ?? "Asia/Kolkata";
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => financeSummaryOf(tx, input, timeZone));
    }),

  bookings: viewer
    .input(bookingsInput)
    .output(bookingPage)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listBookings(tx, input))),

  costs: viewer
    .input(quoteCostsInput)
    .output(bookingCosts)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => bookingCostsOf(tx, input.quoteId))),

  addCost: adder
    .input(addTripCostInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => addTripCost(tx, ctx.member, input))),

  markCostPaid: editor
    .input(markTripCostPaidInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => markTripCostPaid(tx, ctx.member, input)),
    ),

  voidCost: editor
    .input(tripCostIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => voidTripCost(tx, ctx.member, input.tripCostId, new Date())),
    ),

  expenses: viewer
    .input(financePeriodInput)
    .output(expenseList)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listExpenses(tx, input))),

  addExpense: adder
    .input(addExpenseInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => addExpense(tx, ctx.member, input))),

  voidExpense: editor
    .input(expenseIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => voidExpense(tx, ctx.member, input.expenseId, new Date())),
    ),
});
