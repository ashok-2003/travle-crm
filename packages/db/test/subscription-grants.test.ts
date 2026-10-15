// Who writes the subscription tables (spec 7.2, 7.3): only the platform role writes plans, subscriptions, payments and
// the policy, the lifecycle's status included (the nightly job runs in the console as that role); the runtime role
// reads them for its request checks, and can neither update nor lock a subscription.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const plan = () => ({
  key: `plan-${randomUUID().slice(0, 8)}`,
  name: "Starter",
  monthlyPricePaise: 250_000,
  seatLimit: 5,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5_000_000_000n,
  modules: ["crm", "quotes"],
});

describe("subscription grants", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let planId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Subscription grants");
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
    await platform.$disconnect();
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
});
