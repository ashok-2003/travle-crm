// Plans as the console edits them (spec 7.2, the owner's pricing): flat tiers per agency, each with a monthly and an
// annual price before GST, the seats they include and a price per extra seat, storage in GB, and the modules included.
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
  /** Before GST, which is shown separately and charged on top (18 %). */
  monthlyPricePaise: pricePaise,
  annualPricePaise: pricePaise,
  /** The seats the price includes. */
  includedSeats: z.int().min(1).max(10_000),
  /** What each seat beyond the included ones adds, per month and per year, before GST. */
  extraSeatMonthlyPricePaise: pricePaise,
  extraSeatAnnualPricePaise: pricePaise,
  whatsappNumberLimit: z.int().min(0).max(100),
  /** Whole gigabytes (10^9 bytes), at most 10 TB. */
  storageGb: z.int().min(1).max(10_000),
  modules: z.array(planModule).max(planModules.length),
};

export const createPlanInput = z.strictObject({ key: planKey, ...planFields });
export type CreatePlanInput = z.infer<typeof createPlanInput>;

/** Everything but the key, which never changes. */
export const updatePlanInput = z.strictObject({ planId: recordId, ...planFields });
export type UpdatePlanInput = z.infer<typeof updatePlanInput>;

export const planIdInput = z.strictObject({ planId: recordId });
export type PlanIdInput = z.infer<typeof planIdInput>;

export const listPlansInput = z.strictObject({ includeArchived: z.boolean().default(false) });
export type ListPlansInput = z.infer<typeof listPlansInput>;

export const planSummary = z.object({
  id: recordId,
  key: planKey,
  name: z.string(),
  monthlyPricePaise: z.int(),
  annualPricePaise: z.int(),
  includedSeats: z.int(),
  extraSeatMonthlyPricePaise: z.int(),
  extraSeatAnnualPricePaise: z.int(),
  whatsappNumberLimit: z.int(),
  storageGb: z.int(),
  modules: z.array(planModule),
  archived: z.boolean(),
});
export type PlanSummary = z.infer<typeof planSummary>;
