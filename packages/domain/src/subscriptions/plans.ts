// Plans (spec 7.2): data the console edits, never names in code. A plan's key never changes; an archived plan takes no
// new subscriptions, nor does the demo's plan, which is not for sale. Writes need the platform role; the api only reads
// plans.
import type { BillingCycle, CreatePlanInput, PlanSummary, UpdatePlanInput } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { isUniqueViolation } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { assertSoldOn, planPriceFor } from "./pricing.js";
import { planSummaryOf } from "./rows.js";

/** The columns a plan's fields fill: extra seats left out are not sold, as with null. */
export function planColumns<Fields extends Omit<CreatePlanInput, "key">>(fields: Fields) {
  return {
    ...fields,
    extraSeatMonthlyPricePaise: fields.extraSeatMonthlyPricePaise ?? null,
    extraSeatYearlyPricePaise: fields.extraSeatYearlyPricePaise ?? null,
    storageLimitBytes: BigInt(fields.storageLimitBytes),
  };
}

/** The demo plan's key: stable, so each night's reset finds it again, and reserved, so no plan for sale takes it. */
export const DEMO_PLAN_KEY = "platform-demo";

export async function createPlan(tx: OrgTx, input: CreatePlanInput): Promise<PlanSummary> {
  // A plan for sale with the demo's key would stop the nightly reset (DEMO_PLAN_KEY_TAKEN) once it had purged the demo.
  if (input.key === DEMO_PLAN_KEY) {
    throw new DomainError("CONFLICT", "PLAN_KEY_RESERVED", "That key is the demo's own plan's");
  }
  try {
    return planSummaryOf(await tx.plan.create({ data: planColumns(input) }));
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError("CONFLICT", "PLAN_KEY_TAKEN", "Another plan has that key");
    throw error;
  }
}

/**
 * Changes what a plan costs, allows and includes. Organizations on it get the new limits, modules and prices at once
 * (an agreed price of their own stays). A cycle's price can't go while an organization pays the plan that way, so
 * every subscription keeps a price. The plan is held first: a subscription being put on it (which holds it to share)
 * either is in what this reads, or waits and then finds the plan as changed.
 */
export async function updatePlan(
  tx: OrgTx,
  input: UpdatePlanInput,
): Promise<{ before: PlanSummary; after: PlanSummary }> {
  await tx.$queryRaw`SELECT 1 FROM "plan" WHERE id = ${input.planId}::uuid FOR NO KEY UPDATE`;
  const before = await findPlan(tx, input.planId);
  const { planId, ...fields } = input;
  for (const cycle of ["monthly", "yearly"] as const) {
    if (planPriceFor(before, cycle) !== null && planPriceFor(fields, cycle) === null) {
      await assertNoneOnCycle(tx, planId, cycle);
    }
  }
  const after = await tx.plan.update({ where: { id: planId }, data: planColumns(fields) });
  return { before, after: planSummaryOf(after) };
}

async function assertNoneOnCycle(tx: OrgTx, planId: string, cycle: BillingCycle): Promise<void> {
  if ((await tx.subscription.count({ where: { planId, billingCycle: cycle } })) > 0) {
    throw new DomainError("CONFLICT", "PLAN_CYCLE_IN_USE", "Organizations pay for this plan that way");
  }
}

/**
 * Takes the plan off sale. Organizations already on it keep it; archiving twice changes nothing. Never the demo's own
 * plan: nothing un-archives a plan, and the next nightly reset would purge the demo, then fail to put it back.
 */
export async function archivePlan(tx: OrgTx, planId: string): Promise<{ plan: PlanSummary; changed: boolean }> {
  const plan = await findPlan(tx, planId);
  if (plan.key === DEMO_PLAN_KEY) {
    throw new DomainError("CONFLICT", "DEMO_PLAN_LOCKED", "The demo's own plan can't be archived");
  }
  if (plan.archived) return { plan, changed: false };
  return {
    plan: planSummaryOf(await tx.plan.update({ where: { id: planId }, data: { archivedAt: new Date() } })),
    changed: true,
  };
}

/** The plans, by name. Without the archived ones, only those on sale: what onboarding may offer. */
export async function listPlans(tx: OrgTx, options: { includeArchived: boolean }): Promise<PlanSummary[]> {
  const plans = await tx.plan.findMany({
    where: options.includeArchived ? {} : { archivedAt: null, forSale: true },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });
  return plans.map(planSummaryOf);
}

export async function findPlan(tx: OrgTx, planId: string): Promise<PlanSummary> {
  const plan = await tx.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new DomainError("NOT_FOUND", "PLAN_NOT_FOUND", "No such plan");
  return planSummaryOf(plan);
}

/**
 * A plan an organization may be put on now, on this billing cycle: not archived, and priced that way; for sale too,
 * unless `demo` (the demo reset putting the demo on its own plan). Holds the plan to share until the transaction ends,
 * so updatePlan can't drop the cycle's price meanwhile.
 */
export async function holdPlanToSubscribe(
  tx: OrgTx,
  planId: string,
  cycle: BillingCycle,
  options: { demo: boolean },
): Promise<PlanSummary> {
  await tx.$queryRaw`SELECT 1 FROM "plan" WHERE id = ${planId}::uuid FOR SHARE`;
  const plan = await findPlan(tx, planId);
  if (plan.archived) throw new DomainError("CONFLICT", "PLAN_ARCHIVED", "That plan is no longer sold");
  if (!plan.forSale && !options.demo) {
    throw new DomainError("CONFLICT", "PLAN_NOT_FOR_SALE", "That plan is not for sale");
  }
  assertSoldOn(plan, cycle);
  return plan;
}
