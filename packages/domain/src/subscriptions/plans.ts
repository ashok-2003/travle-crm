// Plans (spec 7.2): data the console edits, never names in code. A plan's key never changes; an archived plan takes no
// new subscriptions. Writes need the platform role; the api only reads plans.
import type { CreatePlanInput, PlanSummary, UpdatePlanInput } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { isUniqueViolation } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { planSummaryOf } from "./rows.js";

export async function createPlan(tx: OrgTx, input: CreatePlanInput): Promise<PlanSummary> {
  try {
    return planSummaryOf(await tx.plan.create({ data: input }));
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("CONFLICT", "PLAN_KEY_TAKEN", "Another plan has that key");
    throw error;
  }
}

/**
 * Changes what a plan costs, allows and includes. Organizations on it get the new limits, modules and prices at once
 * (an agreed price of their own stays).
 */
export async function updatePlan(
  tx: OrgTx,
  input: UpdatePlanInput,
): Promise<{ before: PlanSummary; after: PlanSummary }> {
  const before = await findPlan(tx, input.planId);
  const { planId, ...fields } = input;
  const after = await tx.plan.update({ where: { id: planId }, data: fields });
  return { before, after: planSummaryOf(after) };
}

/** Takes the plan off sale. Organizations already on it keep it; archiving twice changes nothing. */
export async function archivePlan(tx: OrgTx, planId: string): Promise<{ plan: PlanSummary; changed: boolean }> {
  const plan = await findPlan(tx, planId);
  if (plan.archived) return { plan, changed: false };
  return {
    plan: planSummaryOf(await tx.plan.update({ where: { id: planId }, data: { archivedAt: new Date() } })),
    changed: true,
  };
}

export async function listPlans(tx: OrgTx, options: { includeArchived: boolean }): Promise<PlanSummary[]> {
  const plans = await tx.plan.findMany({
    where: options.includeArchived ? {} : { archivedAt: null },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  return plans.map(planSummaryOf);
}

export async function findPlan(tx: OrgTx, planId: string): Promise<PlanSummary> {
  const plan = await tx.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new DomainError("NOT_FOUND", "PLAN_NOT_FOUND", "No such plan");
  return planSummaryOf(plan);
}

/** A plan an organization may be put on now: one that is still sold. */
export async function findPlanOnSale(tx: OrgTx, planId: string): Promise<PlanSummary> {
  const plan = await findPlan(tx, planId);
  if (plan.archived) throw new DomainError("CONFLICT", "PLAN_ARCHIVED", "That plan is no longer sold");
  return plan;
}
