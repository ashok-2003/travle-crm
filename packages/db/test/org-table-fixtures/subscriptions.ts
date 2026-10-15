// Isolation fixtures for the subscriptions module. Only the platform role writes these rows, the nightly lifecycle job
// included; the runtime role may only read them.
import { randomUUID } from "node:crypto";
import type { PlatformTx } from "../../src/platform.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

/** The organization's subscription, made if it has none: either fixture may run first. */
async function subscribe(tx: PlatformTx, organizationId: string) {
  const existing = await tx.subscription.findUnique({ where: { organizationId } });
  if (existing) return existing;
  const plan = await tx.plan.create({
    data: {
      key: `isolation-${randomUUID().slice(0, 8)}`,
      name: "Isolation plan",
      monthlyPricePaise: 100_000,
      seatLimit: 5,
      whatsappNumberLimit: 1,
      storageLimitBytes: 1_000_000n,
      modules: ["crm"],
    },
  });
  return tx.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      billingCycle: "monthly",
      status: "active",
      statusChangedAt: new Date("2026-10-01T00:00:00Z"),
      paidThrough: new Date("2026-12-31"),
    },
  });
}

export const fixtures: OrgTableFixtures = {
  subscription: { createAsPlatform: subscribe, appendOnly: true },
  subscription_payment: {
    createAsPlatform: async (tx, organizationId) => {
      // A payment needs its organization's subscription.
      await subscribe(tx, organizationId);
      return tx.subscriptionPayment.create({
        data: {
          organizationId,
          amountPaise: 100_000,
          paidOn: new Date("2026-10-16"),
          paidThrough: new Date("2026-11-15"),
        },
      });
    },
    appendOnly: true,
  },
};
