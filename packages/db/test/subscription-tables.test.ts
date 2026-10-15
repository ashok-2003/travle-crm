// Rules the subscription tables enforce themselves (spec 7.2, 7.3): only the platform role writes plans, subscriptions,
// payments and the policy; the runtime role reads them and may move a subscription's status, nothing else; and the
// values stay within what the lifecycle knows.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
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
        statusChangedAt: new Date(),
        trialEndsOn: new Date("2026-10-30"),
      },
    });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("lets the runtime role read plans, the policy and its own subscription", async () => {
    expect(await db.forOrg(organizationId, (tx) => tx.plan.count({ where: { id: planId } }))).toBe(1);
    expect(
      await db.forOrg(organizationId, (tx) => tx.subscriptionPolicy.findUnique({ where: { id: true } })),
    ).toMatchObject({ pastDueDays: 7, readOnlyDays: 14 });
    expect(await db.forOrg(organizationId, (tx) => tx.subscription.count())).toBe(1);
  });

  it("lets the runtime role move a subscription's status, and change nothing else", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.subscription.update({
          where: { organizationId },
          data: { status: "past_due", statusChangedAt: new Date() },
        }),
      ),
    ).resolves.toMatchObject({ status: "past_due" });
    for (const data of [
      { planId },
      { paidThrough: new Date("2027-01-01") },
      { extraSeats: 50 },
      { extraModules: ["accounts"] },
    ]) {
      await expect(
        db.forOrg(organizationId, (tx) => tx.subscription.update({ where: { organizationId }, data })),
      ).rejects.toThrow(/permission denied/);
    }
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

  it("keeps plans priced, limited and on the product's modules", async () => {
    for (const bad of [
      { ...plan(), key: "Starter" },
      { ...plan(), monthlyPricePaise: null },
      { ...plan(), monthlyPricePaise: -1 },
      { ...plan(), seatLimit: 0 },
      { ...plan(), modules: ["crm", "teleport"] },
    ]) {
      await expect(platform.plan.create({ data: bad })).rejects.toThrow(/check constraint|plan_/);
    }
  });

  it("keeps subscriptions in the lifecycle's states, and a trial dated", async () => {
    const other = await createTestOrganization(platform, "Subscription checks");
    const base = { organizationId: other, planId, billingCycle: "monthly", statusChangedAt: new Date() };
    await expect(platform.subscription.create({ data: { ...base, status: "paused" } })).rejects.toThrow(
      /subscription_status_value/,
    );
    await expect(platform.subscription.create({ data: { ...base, status: "trial" } })).rejects.toThrow(
      /subscription_trial_dated/,
    );
    await expect(
      platform.subscription.create({ data: { ...base, status: "active", billingCycle: "weekly" } }),
    ).rejects.toThrow(/subscription_billing_cycle_value/);
    await expect(
      platform.subscription.create({ data: { ...base, status: "active", extraModules: ["teleport"] } }),
    ).rejects.toThrow(/subscription_extra_modules_known/);
  });

  it("keeps payments positive, voided with a reason, and a provider's payment once", async () => {
    const payment = { organizationId, paidOn: new Date("2026-10-16"), paidThrough: new Date("2026-11-15") };
    await expect(platform.subscriptionPayment.create({ data: { ...payment, amountPaise: 0 } })).rejects.toThrow(
      /subscription_payment_amount_positive/,
    );
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

  it("holds one policy row, with sensible days", async () => {
    await expect(platform.subscriptionPolicy.create({ data: { id: false } })).rejects.toThrow(
      /subscription_policy_one_row/,
    );
    await expect(platform.subscriptionPolicy.update({ where: { id: true }, data: { pastDueDays: 0 } })).rejects.toThrow(
      /subscription_policy_days/,
    );
  });
});
