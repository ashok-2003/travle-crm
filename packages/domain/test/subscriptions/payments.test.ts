// Payments the console records (spec 7.3, 7.4): one pays the organization through a day and makes it active again
// from today; an older payment never moves the day back; a provider's repeated payment is recorded once; a mistaken
// one is voided, changing no dates.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSubscription, listPayments, recordPayment, suspend, voidPayment } from "../../src/subscriptions/index.js";
import {
  adminUserId,
  byAdmin,
  createSubscribedOrganization,
  createTestPlan,
  createTestSubscriptions,
  subscriptionEntries,
  type TestSubscriptions,
} from "./test-subscriptions.js";

const now = new Date("2026-10-16T06:00:00Z");

describe("subscription payments", () => {
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

  it("records a payment, paying the organization through its day and making it active again", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-10-20" }, { now });
    await test.platformDb.transaction((tx) => suspend(tx, byAdmin, { organizationId, reason: "Unpaid" }, now));
    const payment = await pay(organizationId, "2026-11-15");
    expect(payment).toMatchObject({
      amountPaise: 250_000,
      paidOn: "2026-10-16",
      paidThrough: "2026-11-15",
      reference: "NEFT UTR 412345678901",
      provider: "manual",
      recordedBy: adminUserId,
      voided: null,
    });
    expect(await test.platformDb.transaction((tx) => getSubscription(tx, organizationId))).toMatchObject({
      status: "active",
      paidThrough: "2026-11-15",
    });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.payment-recorded",
      source: "platform",
      before: { paidThrough: "2026-10-20", status: "suspended" },
      after: { paymentId: payment.id, amountPaise: 250_000, paidThrough: "2026-11-15", status: "active" },
    });
  });

  it("never moves the paid-through day back for an older period's payment", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-12-31" }, { now });
    await pay(organizationId, "2026-09-30");
    expect(await test.platformDb.transaction((tx) => getSubscription(tx, organizationId))).toMatchObject({
      paidThrough: "2026-12-31",
      status: "active",
    });
  });

  it("records a provider's payment once, however often its webhook comes", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, {}, { now });
    const fromRazorpay = () =>
      test.platformDb.transaction((tx) =>
        recordPayment(
          tx,
          { userId: null },
          { organizationId, amountPaise: 250_000, paidOn: "2026-10-16", paidThrough: "2026-11-15", reference: null },
          { now, provider: { provider: "razorpay", providerPaymentId: "pay_Ox1Q2w3E4r5T6y" } },
        ),
      );
    const first = await fromRazorpay();
    expect(await fromRazorpay()).toEqual(first);
    expect(first).toMatchObject({ provider: "razorpay", recordedBy: null });
    expect(await test.platformDb.transaction((tx) => listPayments(tx, organizationId))).toHaveLength(1);
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.payment-recorded",
      actorUserId: null,
      source: "job",
    });
  });

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
    expect(await test.platformDb.transaction((tx) => getSubscription(tx, organizationId))).toMatchObject({
      paidThrough: "2027-10-31",
    });
    await expect(
      test.platformDb.transaction((tx) =>
        voidPayment(tx, byAdmin, { organizationId, paymentId: "0199e7a0-0000-7000-8000-0000000000ef", reason: "x" }),
      ),
    ).rejects.toMatchObject({ reason: "PAYMENT_NOT_FOUND" });
    expect(
      (await test.platformDb.transaction((tx) => listPayments(tx, organizationId))).map((payment) => payment.id),
    ).toEqual([mistake.id]);
  });
});
