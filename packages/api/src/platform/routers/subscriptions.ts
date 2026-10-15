// The console's work on one organization's subscription (spec 7.2-7.4): its plan, dates, overrides, status by hand,
// and the payments recorded against it. Platform staff of either level.
import {
  changePlanInput,
  endAccessInput,
  organizationIdInput,
  recordPaymentInput,
  setOverridesInput,
  setPaidThroughInput,
  setTrialEndInput,
  subscriptionDetails,
  subscriptionPayment,
  subscriptionWithPayments,
  voidPaymentInput,
} from "@travel-crm/contracts/subscriptions";
import {
  cancel,
  changePlan,
  getSubscription,
  recordPayment,
  setOverrides,
  setPaidThrough,
  setTrialEnd,
  suspend,
  voidPayment,
} from "@travel-crm/domain/platform";
import { staffProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const subscriptionsRouter = platformT.router({
  get: staffProcedure
    .input(organizationIdInput)
    .output(subscriptionWithPayments)
    .query(({ ctx, input }) => getSubscription(ctx.services, input.organizationId)),
  changePlan: staffProcedure
    .input(changePlanInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => changePlan(ctx.services, ctx.staff, input)),
  setOverrides: staffProcedure
    .input(setOverridesInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => setOverrides(ctx.services, ctx.staff, input)),
  setTrialEnd: staffProcedure
    .input(setTrialEndInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => setTrialEnd(ctx.services, ctx.staff, input)),
  setPaidThrough: staffProcedure
    .input(setPaidThroughInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => setPaidThrough(ctx.services, ctx.staff, input)),
  recordPayment: staffProcedure
    .input(recordPaymentInput)
    .output(subscriptionPayment)
    .mutation(({ ctx, input }) => recordPayment(ctx.services, ctx.staff, input)),
  voidPayment: staffProcedure
    .input(voidPaymentInput)
    .output(subscriptionPayment)
    .mutation(({ ctx, input }) => voidPayment(ctx.services, ctx.staff, input)),
  suspend: staffProcedure
    .input(endAccessInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => suspend(ctx.services, ctx.staff, input)),
  cancel: staffProcedure
    .input(endAccessInput)
    .output(subscriptionDetails)
    .mutation(({ ctx, input }) => cancel(ctx.services, ctx.staff, input)),
});
