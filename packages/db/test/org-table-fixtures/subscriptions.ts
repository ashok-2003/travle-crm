// Isolation fixtures for the subscriptions module. Only the platform role inserts these rows; the runtime role may
// move a subscription's status, and change nothing else.
import { randomUUID } from "node:crypto";
import type { PlatformTx } from "../../src/platform.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

async function subscribe(tx: PlatformTx, organizationId: string) {
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
      statusChangedAt: new Date(),
      paidThrough: new Date("2026-12-31"),
    },
  });
}

export const fixtures: OrgTableFixtures = {
  subscription: { createAsPlatform: subscribe, appendOnly: true, updatableColumn: "status" },
  subscription_payment: {
    createAsPlatform: async (tx, organizationId) => {
      // A payment needs its organization's subscription, which the subscription fixture may have made already.
      if (!(await tx.subscription.findUnique({ where: { organizationId } }))) await subscribe(tx, organizationId);
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
