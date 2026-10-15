// Voiding a payment recorded by mistake (spec 7.4): with a reason, once, even when two voids come at the same moment,
// changing no dates; payments are listed newest first, voided ones included.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSubscription, listPayments, recordPayment, voidPayment } from "../../src/subscriptions/index.js";
import { waitUntilBlockedBy } from "../lock-waits.js";
import {
  adminUserId,
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  holdOpen,
  subscriptionEntries,
  testNow,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const now = testNow;

describe("voided payments", () => {
  let test: TestSubscriptions;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestSubscriptions();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const pay = (organizationId: string, paidThrough: string, amountPaise = 250_000) =>
    test.platformDb.transaction((tx) =>
      recordPayment(
        tx,
        byAdmin,
        { organizationId, amountPaise, paidOn: "2026-10-16", paidThrough, reference: "NEFT UTR 412345678901" },
        { now },
      ),
    );
  const subscriptionOf = (organizationId: string) =>
    test.platformDb.transaction((tx) => getSubscription(tx, organizationId, now));

  it("voids a mistaken payment with a reason, once, changing no dates, and lists payments newest first", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-10-31" }, { now });
    const mistake = await pay(organizationId, "2027-10-31", 25_000_000);
    const voided = await test.platformDb.transaction((tx) =>
      voidPayment(tx, byAdmin, { organizationId, paymentId: mistake.id, reason: "Typed ₹2,50,000 for ₹25,000" }),
    );
    expect(voided.voided).toMatchObject({ by: adminUserId, reason: "Typed ₹2,50,000 for ₹25,000" });
    expect(
      await test.platformDb.transaction((tx) =>
        voidPayment(tx, byAdmin, { organizationId, paymentId: mistake.id, reason: "Again" }),
      ),
    ).toEqual(voided);
    expect(await subscriptionOf(organizationId)).toMatchObject({ paidThrough: "2027-10-31" });
    await expect(
      test.platformDb.transaction((tx) =>
        voidPayment(tx, byAdmin, { organizationId, paymentId: "0199e7a0-0000-7000-8000-0000000000ef", reason: "x" }),
      ),
    ).rejects.toMatchObject({ reason: "PAYMENT_NOT_FOUND" });
    expect(
      (await test.platformDb.transaction((tx) => listPayments(tx, organizationId))).map((payment) => payment.id),
    ).toEqual([mistake.id]);
  });

  it("voids a payment once when two voids come at the same moment", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-10-31" }, { now });
    const mistake = await pay(organizationId, "2026-11-30");
    const held = holdOpen();
    const first = test.platformDb.transaction(async (tx) => {
      const voided = await voidPayment(tx, byAdmin, { organizationId, paymentId: mistake.id, reason: "First" });
      await held.pause(tx);
      return voided;
    });
    const pid = await held.pid;
    const otherAdmin = { userId: "0199e7a0-0000-7000-8000-00000000ad02" };
    const second = test.platformDb.transaction((tx) =>
      voidPayment(tx, otherAdmin, { organizationId, paymentId: mistake.id, reason: "Second" }),
    );
    await waitUntilBlockedBy(test.platform, pid);
    held.release();
    await first;
    expect((await second).voided).toMatchObject({ by: adminUserId, reason: "First" });
    const voids = (await subscriptionEntries(test, organizationId)).filter(
      (entry) => entry.action === "subscription.payment-voided",
    );
    expect(voids).toHaveLength(1);
  });
});
