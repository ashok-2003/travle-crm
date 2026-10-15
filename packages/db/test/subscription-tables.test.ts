// Rules the subscription tables enforce themselves (spec 7.2, 7.3): the values stay within what the lifecycle and the
// owner's pricing know, and no plan is seeded (the platform team enters them). Who may write them:
// subscription-grants.test.ts.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
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
  let organizationId: string;
  let planId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
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
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("seeds no plan, and a plan is for sale unless made otherwise (the demo's own)", async () => {
    expect(await platform.plan.count({ where: { key: { in: ["starter", "growth", "pro", "platform-demo"] } } })).toBe(
      0,
    );
    expect(await platform.plan.findUniqueOrThrow({ where: { id: planId } })).toMatchObject({ forSale: true });
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

  it("keeps payments positive, voided with a reason, and a provider's once; arrears may be for days already past", async () => {
    const payment = { organizationId, paidOn: new Date("2026-10-16"), paidThrough: new Date("2026-11-15") };
    await expect(platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 0 } })).rejects.toThrow(
      /subscription_payment_amount_positive/,
    );
    const arrears = { ...payment, amountPaise: 100, paidThrough: new Date("2026-09-30") };
    await expect(platform.subscriptionPayment.create({ data: arrears })).resolves.toMatchObject({ amountPaise: 100 });
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
