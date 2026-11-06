// Payments to check: the list a person works through, and their word on each (confirm, refuse, dismiss). Only a person
// decides money; the customer is told after, by code.
import {
  confirmPaymentInput,
  dismissProofInput,
  paymentDecision,
  paymentPreview,
  paymentPreviewInput,
  paymentsToCheckCount,
  paymentsToCheckInput,
  paymentsToCheckPage,
  refusePaymentInput,
} from "@travel-crm/contracts/bookings";
import {
  confirmPayment,
  countPaymentsToCheck,
  dismissProof,
  paymentMessagePreview,
  paymentsToCheck,
  refusePayment,
} from "@travel-crm/domain/bookings";
import type { Context } from "../context.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = orgProcedure.requires("bookings:view", "quotes:record_payments");
const checker = freshProcedure.requires("bookings:view", "quotes:record_payments");

const agencyNameOf = async (ctx: Pick<Context, "identity"> & { member: { organizationId: string } }) =>
  (await ctx.identity.organizationProfile(ctx.member.organizationId))?.name;

export const paymentsToCheckRouter = router({
  list: viewer
    .input(paymentsToCheckInput)
    .output(paymentsToCheckPage)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => paymentsToCheck(tx, ctx.member, input)),
    ),

  count: viewer
    .output(paymentsToCheckCount)
    .query(({ ctx }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({ count: await countPaymentsToCheck(tx, ctx.member) })),
    ),

  /** What confirming (the amount typed so far) or a not found would tell the customer, before the person decides. */
  preview: viewer
    .input(paymentPreviewInput)
    .output(paymentPreview)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => paymentMessagePreview(tx, ctx.member, input, new Date())),
    ),

  confirm: checker
    .input(confirmPaymentInput)
    .output(paymentDecision)
    .mutation(async ({ ctx, input }) => {
      const agencyName = await agencyNameOf(ctx);
      const told = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        confirmPayment(tx, ctx.member, { ...input, ...(agencyName === undefined ? {} : { agencyName }) }, new Date()),
      );
      return { told };
    }),

  refuse: checker
    .input(refusePaymentInput)
    .output(paymentDecision)
    .mutation(async ({ ctx, input }) => {
      const agencyName = await agencyNameOf(ctx);
      const told = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        refusePayment(tx, ctx.member, { ...input, ...(agencyName === undefined ? {} : { agencyName }) }, new Date()),
      );
      return { told };
    }),

  dismissProof: checker
    .input(dismissProofInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => dismissProof(tx, ctx.member, input)),
    ),
});
