// The shared demo's own plan (spec 7.4): plans are global, so the demo can't use the tiers on sale without putting
// them on sale everywhere. This one is not for sale: onboarding never lists it nor takes it, and only the platform's
// own job (the nightly demo reset) puts an organization on it.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { planModules } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { planColumns } from "./plans.js";
import { planSummaryOf } from "./rows.js";

/** The demo plan's key: stable, so each night's reset finds it again. */
export const DEMO_PLAN_KEY = "platform-demo";

/** Every module, room for the demo's staff and its files, and no price: nobody pays for the demo. */
const demoPlanFields = {
  key: DEMO_PLAN_KEY,
  name: "Demo",
  monthlyPricePaise: 0,
  yearlyPricePaise: null,
  seatLimit: 10,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5 * 1024 ** 3,
  modules: [...planModules],
};

/**
 * The demo's plan, made the first time it is asked for and found again after: what the demo reset subscribes the demo
 * organization to, monthly. A plan for sale that already has the key is never taken over (DEMO_PLAN_KEY_TAKEN). The
 * platform role only.
 */
export async function demoPlan(tx: OrgTx): Promise<PlanSummary> {
  const plan = planSummaryOf(
    await tx.plan.upsert({
      where: { key: DEMO_PLAN_KEY },
      create: { ...planColumns(demoPlanFields), forSale: false },
      update: {},
    }),
  );
  if (plan.forSale) {
    throw new DomainError("CONFLICT", "DEMO_PLAN_KEY_TAKEN", "A plan for sale has the demo plan's key");
  }
  return plan;
}
