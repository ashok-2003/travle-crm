// What the Owner's Plan & billing page reads: the plan's limits (a Growth-like plan's 20,000 AI credits among them)
// beside the use passed in and counted, and only the payments not voided, newest first.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billingViewOf, createSubscriptionAccess, recordPayment, voidPayment } from "../../src/subscriptions/index.js";
import {
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

describe("billingViewOf", () => {
  let test: TestSubscriptions;
  let growth: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    growth = await createTestPlan(test, { name: "Growth", aiCreditsPerMonth: 20_000, seatLimit: 6 });
  });

  afterAll(async () => {
    await test.close();
  });

  const pay = (organizationId: string, paidOn: string, amountPaise: number, reference: string) =>
    test.platformDb.transaction((tx) =>
      recordPayment(
        tx,
        byAdmin,
        { organizationId, amountPaise, paidOn, paidThrough: "2027-10-15", reference },
        { now: testNow },
      ),
    );

  async function viewOf(organizationId: string) {
    const entitlements = await createSubscriptionAccess({ db: test.db, now: () => testNow }).entitlementsOf(
      organizationId,
    );
    if (!entitlements) throw new Error("no subscription");
    return test.db.forOrg(organizationId, (tx) =>
      billingViewOf(tx, entitlements, organizationId, {
        seats: 4,
        aiCredits: { limit: 20_000, used: 1_234 },
        storageUsedBytes: 4_096,
      }),
    );
  }

  it("shows the plan's limits beside the use, the AI credits and storage as passed in", async () => {
    const organizationId = await createSubscribedOrganization(test, growth, { paidThrough: "2027-10-15" });
    expect(await viewOf(organizationId)).toMatchObject({
      planName: "Growth",
      status: "active",
      paidThrough: "2027-10-15",
      seats: { limit: 6, used: 4 },
      whatsappNumbers: { limit: 1, used: 0 },
      storageBytes: { limit: 5_000_000_000, used: 4_096 },
      aiCredits: { limit: 20_000, used: 1_234 },
      payments: [],
    });
  });

  it("lists the payments newest first, and leaves out a voided one", async () => {
    const organizationId = await createSubscribedOrganization(test, growth);
    await pay(organizationId, "2026-08-01", 800_000, "UTR first");
    const mistaken = await pay(organizationId, "2026-09-01", 900_000, "UTR mistaken");
    await pay(organizationId, "2026-10-01", 800_000, "UTR third");
    await test.platformDb.transaction((tx) =>
      voidPayment(tx, byAdmin, { organizationId, paymentId: mistaken.id, reason: "Recorded twice" }),
    );
    const { payments } = await viewOf(organizationId);
    expect(payments.map((payment) => payment.reference)).toEqual(["UTR third", "UTR first"]);
    expect(payments[0]).toEqual({
      paidOn: "2026-10-01",
      amountPaise: 800_000,
      paidThrough: "2027-10-15",
      reference: "UTR third",
    });
  });

  it("lists at most the newest 24", async () => {
    const organizationId = await createSubscribedOrganization(test, growth);
    for (let month = 0; month < 26; month += 1) {
      const paidOn = new Date(Date.UTC(2024, month, 1)).toISOString().slice(0, 10);
      await pay(organizationId, paidOn, 100_000 + month, `UTR ${String(month)}`);
    }
    const { payments } = await viewOf(organizationId);
    expect(payments).toHaveLength(24);
    expect(payments[0]?.reference).toBe("UTR 25");
  });
});
