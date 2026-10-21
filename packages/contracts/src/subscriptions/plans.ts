// Plans as the console edits them (spec 7.2, the owner's pricing): tiers with a flat INR price per organization, per
// month and/or year and before GST, the seats, storage and modules they include, and a price for each seat bought
// above the plan's.
import { z } from "zod";
import { recordId } from "../identity/index.js";

/** The business modules a plan can include (spec 1's build order). The Foundation's own features come with every plan. */
export const planModules = [
  "crm",
  "inbox",
  "catalog",
  "quotes",
  "bookings",
  "departures",
  "suppliers",
  "accounts",
  "reports",
] as const;
export const planModule = z.enum(planModules);
export type PlanModule = z.infer<typeof planModule>;

/** A plan's stable key, e.g. "starter". Matches the database's plan_key_format check. */
export const planKey = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/, "Use 2-32 lower-case letters, digits or dashes");

/** INR in paise: at most ₹2,00,00,000, comfortably below the database's integer limit. */
export const pricePaise = z.int().min(0).max(2_000_000_000);

const planFields = {
  name: z.string().trim().min(1).max(60),
  /**
   * Before GST, which is shown separately and charged on top (18 %), for the whole organization. Null when the plan
   * isn't sold that way: a plan is sold only on the billing cycles it has a price for. At least one is set.
   */
  monthlyPricePaise: pricePaise.nullable(),
  yearlyPricePaise: pricePaise.nullable(),
  /** One seat above the plan's, before GST. Null or left out: the plan sells no extra seats that way. */
  extraSeatMonthlyPricePaise: pricePaise.nullable().optional(),
  extraSeatYearlyPricePaise: pricePaise.nullable().optional(),
  /** The staff seats the price includes. */
  seatLimit: z.int().min(1).max(10_000),
  whatsappNumberLimit: z.int().min(0).max(100),
  /** At most 10 TB. */
  storageLimitBytes: z.int().min(1).max(10_000_000_000_000),
  modules: z.array(planModule).max(planModules.length),
};

const isPriced = (plan: { monthlyPricePaise: number | null; yearlyPricePaise: number | null }) =>
  plan.monthlyPricePaise !== null || plan.yearlyPricePaise !== null;
const priceMissing = { message: "Give a monthly price, a yearly price or both", path: ["monthlyPricePaise"] };

export const createPlanInput = z.strictObject({ key: planKey, ...planFields }).refine(isPriced, priceMissing);
export type CreatePlanInput = z.infer<typeof createPlanInput>;

/** Everything but the key, which never changes. */
export const updatePlanInput = z.strictObject({ planId: recordId, ...planFields }).refine(isPriced, priceMissing);
export type UpdatePlanInput = z.infer<typeof updatePlanInput>;

export const planIdInput = z.strictObject({ planId: recordId });
export type PlanIdInput = z.infer<typeof planIdInput>;

export const listPlansInput = z.strictObject({ includeArchived: z.boolean().default(false) });
export type ListPlansInput = z.infer<typeof listPlansInput>;

export const planSummary = z.object({
  id: recordId,
  key: planKey,
  name: z.string(),
  monthlyPricePaise: z.int().nullable(),
  yearlyPricePaise: z.int().nullable(),
  extraSeatMonthlyPricePaise: z.int().nullable(),
  extraSeatYearlyPricePaise: z.int().nullable(),
  seatLimit: z.int(),
  whatsappNumberLimit: z.int(),
  storageLimitBytes: z.int(),
  modules: z.array(planModule),
  /** False only for the demo's own plan, which is never offered at onboarding. */
  forSale: z.boolean(),
  archived: z.boolean(),
});
export type PlanSummary = z.infer<typeof planSummary>;

/**
 * A plan as the product's public pricing page shows it: what it costs and holds, and nothing a visitor has no need of
 * (its id, whether it is archived). Only plans on sale are listed.
 */
export const publicPlan = planSummary.pick({
  key: true,
  name: true,
  monthlyPricePaise: true,
  yearlyPricePaise: true,
  extraSeatMonthlyPricePaise: true,
  extraSeatYearlyPricePaise: true,
  seatLimit: true,
  whatsappNumberLimit: true,
  storageLimitBytes: true,
  modules: true,
});
export type PublicPlan = z.infer<typeof publicPlan>;
export const publicPlans = z.array(publicPlan);
