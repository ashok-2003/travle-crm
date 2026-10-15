// The console's plans (spec 7.2): super admins create, change and archive them. Plans belong to no organization, so
// every change goes in the platform log, in the same platform transaction.
import type {
  CreatePlanInput,
  ListPlansInput,
  PlanSummary,
  SubscriptionPolicy,
  UpdatePlanInput,
} from "@travel-crm/contracts/subscriptions";
import * as subscriptions from "../subscriptions/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** What the platform log keeps of a plan: everything but its id, which the entry names. */
function snapshotOf(plan: PlanSummary) {
  return {
    key: plan.key,
    name: plan.name,
    monthlyPricePaise: plan.monthlyPricePaise,
    annualPricePaise: plan.annualPricePaise,
    includedSeats: plan.includedSeats,
    extraSeatMonthlyPricePaise: plan.extraSeatMonthlyPricePaise,
    extraSeatAnnualPricePaise: plan.extraSeatAnnualPricePaise,
    whatsappNumberLimit: plan.whatsappNumberLimit,
    storageGb: plan.storageGb,
    modules: plan.modules,
    archived: plan.archived,
  };
}

export async function listPlans(services: PlatformServices, input: ListPlansInput): Promise<PlanSummary[]> {
  return services.platformDb.transaction((tx) => subscriptions.listPlans(tx, input));
}

export async function createPlan(
  services: PlatformServices,
  staff: PlatformActor,
  input: CreatePlanInput,
): Promise<PlanSummary> {
  return services.platformDb.transaction(async (tx) => {
    const plan = await subscriptions.createPlan(tx, input);
    await recordPlatformAudit(tx, staff, {
      action: "plan.created",
      targetType: "plan",
      targetId: plan.id,
      after: snapshotOf(plan),
    });
    return plan;
  });
}

export async function updatePlan(
  services: PlatformServices,
  staff: PlatformActor,
  input: UpdatePlanInput,
): Promise<PlanSummary> {
  return services.platformDb.transaction(async (tx) => {
    const { before, after } = await subscriptions.updatePlan(tx, input);
    await recordPlatformAudit(tx, staff, {
      action: "plan.updated",
      targetType: "plan",
      targetId: after.id,
      before: snapshotOf(before),
      after: snapshotOf(after),
    });
    return after;
  });
}

export async function archivePlan(
  services: PlatformServices,
  staff: PlatformActor,
  planId: string,
): Promise<PlanSummary> {
  return services.platformDb.transaction(async (tx) => {
    const { plan, changed } = await subscriptions.archivePlan(tx, planId);
    if (changed)
      await recordPlatformAudit(tx, staff, { action: "plan.archived", targetType: "plan", targetId: plan.id });
    return plan;
  });
}

export async function getSubscriptionPolicy(services: PlatformServices): Promise<SubscriptionPolicy> {
  return services.platformDb.transaction((tx) => subscriptions.getSubscriptionPolicy(tx));
}

/**
 * Changes how many days a new organization's trial lasts, and an organization stays past due, then read-only (spec
 * 7.3). Super admins only. The same days again record nothing.
 */
export async function setSubscriptionPolicy(
  services: PlatformServices,
  staff: { userId: string },
  policy: SubscriptionPolicy,
): Promise<SubscriptionPolicy> {
  return services.platformDb.transaction(async (tx) => {
    const { before, after, changed } = await subscriptions.setSubscriptionPolicy(tx, staff, policy);
    if (changed) {
      await recordPlatformAudit(tx, staff, {
        action: "subscription-policy.changed",
        targetType: "subscription_policy",
        targetId: "policy",
        before,
        after,
      });
    }
    return after;
  });
}
