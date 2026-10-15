// The console's plans and subscription policy (spec 7.2, 7.3): all platform staff see them; super admins change them.
import {
  createPlanInput,
  listPlansInput,
  planIdInput,
  planSummary,
  setSubscriptionPolicyInput,
  subscriptionPolicy,
  updatePlanInput,
} from "@travel-crm/contracts/subscriptions";
import {
  archivePlan,
  createPlan,
  getSubscriptionPolicy,
  listPlans,
  setSubscriptionPolicy,
  updatePlan,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure, superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const plansRouter = platformT.router({
  list: staffProcedure
    .input(listPlansInput)
    .output(z.array(planSummary))
    .query(({ ctx, input }) => listPlans(ctx.services, input)),
  create: superAdminProcedure
    .input(createPlanInput)
    .output(planSummary)
    .mutation(({ ctx, input }) => createPlan(ctx.services, ctx.staff, input)),
  update: superAdminProcedure
    .input(updatePlanInput)
    .output(planSummary)
    .mutation(({ ctx, input }) => updatePlan(ctx.services, ctx.staff, input)),
  archive: superAdminProcedure
    .input(planIdInput)
    .output(planSummary)
    .mutation(({ ctx, input }) => archivePlan(ctx.services, ctx.staff, input.planId)),
  /** How many days an organization stays past due, then read-only. */
  policy: staffProcedure.output(subscriptionPolicy).query(({ ctx }) => getSubscriptionPolicy(ctx.services)),
  setPolicy: superAdminProcedure
    .input(setSubscriptionPolicyInput)
    .output(subscriptionPolicy)
    .mutation(({ ctx, input }) => setSubscriptionPolicy(ctx.services, ctx.staff, input)),
});
