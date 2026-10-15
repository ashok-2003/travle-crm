// Rules the subscription tables enforce themselves (spec 7.2, 7.3): only the platform role writes plans, subscriptions,
// payments and the policy, the lifecycle's status included; the runtime role only reads them; and the values stay
// within what the lifecycle and the owner's pricing know. No plan is seeded: the platform team enters them.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const plan = (key = `plan-${randomUUID().slice(0, 8)}`) => ({
  key,
  name: "Starter",
  monthlyPricePaise: 250_000,
  extraSeatMonthlyPricePaise: 50_000,
  seatLimit: 5,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5_000_000_000n,
  modules: ["crm", "quotes"],
});

describe("subscription tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let planId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Subscription tables");
    planId = (await platform.plan.create({ data: plan() })).id;
    await platform.subscription.create({
      data: {
        organizationId,
        planId,
        billingCycle: "monthly",
        status: "trial",
        statusChangedAt: new Date("2026-10-16T00:00:00Z"),
        trialEndsOn: new Date("2026-10-30"),
      },
    });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("seeds no plan: the prices aren't the owner's yet, and the platform team enters plans in the console", async () => {
    expect(await platform.plan.count({ where: { key: { in: ["starter", "growth", "pro"] } } })).toBe(0);
  });

  it("lets the runtime role read plans, the policy and its own subscription", async () => {
    expect(await db.forOrg(organizationId, (tx) => tx.plan.count({ where: { id: planId } }))).toBe(1);
    expect(
      await db.forOrg(organizationId, (tx) => tx.subscriptionPolicy.findUnique({ where: { id: true } })),
    ).toMatchObject({ trialDays: 7, pastDueDays: 7, readOnlyDays: 14 });
    expect(await db.forOrg(organizationId, (tx) => tx.subscription.count())).toBe(1);
  });

  it("refuses the runtime role every update of a subscription, its status included", async () => {
    for (const data of [
      { status: "active", statusChangedAt: new Date("2026-10-16T00:00:00Z") },
      { status: "past_due" },
      { statusChangedAt: new Date("2099-01-01T00:00:00Z") },
      { planId },
      { paidThrough: new Date("2027-01-01") },
      { extraSeats: 50 },
      { extraModules: ["accounts"] },
      { manualSuspensionAt: null },
    ]) {
      await expect(
        db.forOrg(organizationId, (tx) => tx.subscription.update({ where: { organizationId }, data })),
      ).rejects.toThrow(/permission denied/);
    }
    // Nor may it lock the row, which needs the right to update it.
    await expect(
      db.forOrg(
        organizationId,
        (tx) =>
          tx.$queryRaw`SELECT 1 FROM subscription WHERE organization_id = ${organizationId}::uuid FOR NO KEY UPDATE`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses every other write to the runtime role", async () => {
    await expect(db.forOrg(organizationId, (tx) => tx.plan.create({ data: plan() }))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.plan.update({ where: { id: planId }, data: { seatLimit: 500 } })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.subscriptionPolicy.update({ where: { id: true }, data: { pastDueDays: 90 } }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.subscriptionPayment.create({
          data: { amountPaise: 1, paidOn: new Date("2026-10-16"), paidThrough: new Date("2030-12-31") },
        }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(db.forOrg(organizationId, (tx) => tx.subscription.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps plans priced, limited and on the product's modules, each by its own check", async () => {
    const cases: [Prisma.PlanCreateInput, string][] = [
      [{ ...plan(), key: "Starter" }, "plan_key_format"],
      [{ ...plan(), monthlyPricePaise: null }, "plan_priced"],
      [{ ...plan(), monthlyPricePaise: -1 }, "plan_prices_not_negative"],
      [{ ...plan(), extraSeatYearlyPricePaise: -1 }, "plan_prices_not_negative"],
      [{ ...plan(), seatLimit: 0 }, "plan_limits_positive"],
      [{ ...plan(), storageLimitBytes: 0n }, "plan_limits_positive"],
      [{ ...plan(), modules: ["crm", "teleport"] }, "plan_modules_known"],
    ];
    for (const [bad, constraint] of cases) {
      await expect(platform.plan.create({ data: bad }), constraint).rejects.toThrow(new RegExp(`\\b${constraint}\\b`));
    }
  });

  it("keeps subscriptions in the lifecycle's states, a trial dated and an active one paid through a day", async () => {
    const other = await createTestOrganization(platform, "Subscription checks");
    const base = {
      organizationId: other,
      planId,
      billingCycle: "monthly",
      statusChangedAt: new Date("2026-10-16T00:00:00Z"),
      paidThrough: new Date("2026-12-31"),
    };
    const cases: [Prisma.SubscriptionUncheckedCreateInput, string][] = [
      [{ ...base, status: "paused" }, "subscription_status_value"],
      [{ ...base, status: "trial" }, "subscription_trial_dated"],
      [{ ...base, status: "active", paidThrough: null }, "subscription_active_paid"],
      [{ ...base, status: "active", billingCycle: "annual" }, "subscription_billing_cycle_value"],
      [{ ...base, status: "active", extraModules: ["teleport"] }, "subscription_extra_modules_known"],
      [{ ...base, status: "active", manualSuspensionAt: new Date() }, "subscription_manual_suspension"],
      [{ ...base, status: "active", manualSuspensionReason: "Unpaid" }, "subscription_manual_suspension"],
    ];
    for (const [data, constraint] of cases) {
      await expect(platform.subscription.create({ data }), constraint).rejects.toThrow(
        new RegExp(`\\b${constraint}\\b`),
      );
    }
    await expect(
      platform.subscription.create({ data: { ...base, status: "active", billingCycle: "yearly" } }),
    ).resolves.toMatchObject({ billingCycle: "yearly" });
  });

  it("keeps payments positive, from the day they were paid, voided with a reason, and a provider's once", async () => {
    const payment = { organizationId, paidOn: new Date("2026-10-16"), paidThrough: new Date("2026-11-15") };
    await expect(platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 0 } })).rejects.toThrow(
      /subscription_payment_amount_positive/,
    );
    await expect(
      platform.subscriptionPayment.create({
        data: { ...payment, amountPaise: 100, paidThrough: new Date("2026-10-15") },
      }),
    ).rejects.toThrow(/subscription_payment_dates/);
    await expect(
      platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 100, voidedAt: new Date() } }),
    ).rejects.toThrow(/subscription_payment_voided/);
    await expect(
      platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 100, provider: "razorpay" } }),
    ).rejects.toThrow(/subscription_payment_provider_id/);
    const fromRazorpay = { ...payment, amountPaise: 100, provider: "razorpay", providerPaymentId: "pay_123" };
    await platform.subscriptionPayment.create({ data: fromRazorpay });
    await expect(platform.subscriptionPayment.create({ data: fromRazorpay })).rejects.toThrow(/Unique constraint/);
  });

  it("holds one policy row, with sensible days for the trial and each unpaid state", async () => {
    await expect(platform.subscriptionPolicy.create({ data: { id: false } })).rejects.toThrow(
      /subscription_policy_one_row/,
    );
    for (const data of [{ trialDays: 0 }, { pastDueDays: 0 }, { readOnlyDays: 181 }]) {
      await expect(platform.subscriptionPolicy.update({ where: { id: true }, data })).rejects.toThrow(
        /subscription_policy_days/,
      );
    }
  });

  it("makes its isolation fixtures in either order", async () => {
    const { fixtures } = await import("./org-table-fixtures/subscriptions.js");
    const other = await createTestOrganization(platform, "Fixtures in order");
    await platformDb.transaction(async (tx) => {
      await fixtures.subscription_payment?.createAsPlatform?.(tx, other);
      await fixtures.subscription?.createAsPlatform?.(tx, other);
    });
    expect(await platform.subscription.count({ where: { organizationId: other } })).toBe(1);
  });
});
