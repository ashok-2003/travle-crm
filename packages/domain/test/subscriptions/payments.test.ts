// Payments the console records (spec 7.3, 7.4): one paying through today or later makes the organization active again
// from any state, but not one suspended by hand; an older period's payment never moves the day back nor makes anything
// active; whether the nightly job has run changes no answer; a provider's repeated payment is recorded once; a
// mistaken one is voided once, changing no dates.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  advanceSubscriptions,
  cancel,
  createSubscriptionAccess,
  getSubscription,
  listPayments,
  recordPayment,
  suspend,
  voidPayment,
} from "../../src/subscriptions/index.js";
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
const started = new Date("2026-08-01T06:00:00Z");

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

  /** A payment through a day, paid on the tests' today unless an older day is given. */
  const pay = (organizationId: string, paidThrough: string, { amountPaise = 250_000, paidOn = "2026-10-16" } = {}) =>
    test.platformDb.transaction((tx) =>
      recordPayment(
        tx,
        byAdmin,
        { organizationId, amountPaise, paidOn, paidThrough, reference: "NEFT UTR 412345678901" },
        { now },
      ),
    );
  const subscriptionOf = (organizationId: string) =>
    test.platformDb.transaction((tx) => getSubscription(tx, organizationId, now));
  const entitlementsOf = (organizationId: string) =>
    createSubscriptionAccess({ db: test.db, now: () => now }).entitlementsOf(organizationId);

  it("records a payment, paying a suspended organization through its day and making it active again", async () => {
    // Paid through August: suspended since 22 September, though the job never recorded it.
    const organizationId = await createSubscribedOrganization(
      test,
      plan,
      { paidThrough: "2026-08-31" },
      { now: started },
    );
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
    expect(await subscriptionOf(organizationId)).toMatchObject({
      status: "active",
      since: "2026-10-16",
      paidThrough: "2026-11-15",
      recorded: { status: "active", since: "2026-10-16" },
    });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.payment-recorded",
      source: "platform",
      before: { paidThrough: "2026-08-31", status: "suspended" },
      after: { paymentId: payment.id, amountPaise: 250_000, paidThrough: "2026-11-15", status: "active" },
    });
  });

  it("never moves the paid-through day back for an older period's payment", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-12-31" }, { now });
    await pay(organizationId, "2026-09-30", { paidOn: "2026-09-01" });
    expect(await subscriptionOf(organizationId)).toMatchObject({ paidThrough: "2026-12-31", status: "active" });
  });

  it("makes nothing active with an older period's payment, though the organization was paid ahead", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-12-31" }, { now });
    await test.platformDb.transaction((tx) => cancel(tx, byAdmin, { organizationId, reason: "Left us" }, now));
    await pay(organizationId, "2026-09-30", { paidOn: "2026-09-01" });
    expect(await subscriptionOf(organizationId)).toMatchObject({ status: "cancelled", paidThrough: "2026-12-31" });
  });

  it("gives a payment through a past day the same answer whether or not the daily job has run", async () => {
    const ran = await createSubscribedOrganization(test, plan, { paidThrough: "2026-09-30" }, { now: started });
    const late = await createSubscribedOrganization(test, plan, { paidThrough: "2026-09-30" }, { now: started });
    await advanceSubscriptions({ db: test.platformDb, organizationIds: [ran], now });
    for (const organizationId of [ran, late]) {
      await pay(organizationId, "2026-10-15", { amountPaise: 100_000, paidOn: "2026-10-01" });
    }
    // Paid through the 30th, so past due from 1 October and read-only from the 8th, whenever the job last ran.
    for (const organizationId of [ran, late]) {
      expect((await entitlementsOf(organizationId))?.status).toBe("read_only");
      expect(await subscriptionOf(organizationId)).toMatchObject({
        status: "read_only",
        recorded: { status: "read_only", since: "2026-10-08" },
      });
    }
  });

  it("keeps a suspension made by hand when a payment comes in: no payment lifts it", async () => {
    const organizationId = await createSubscribedOrganization(test, plan, { paidThrough: "2026-12-31" }, { now });
    await test.platformDb.transaction((tx) => suspend(tx, byAdmin, { organizationId, reason: "Chargeback" }, now));
    await pay(organizationId, "2027-01-31");
    expect(await entitlementsOf(organizationId)).toMatchObject({
      status: "suspended",
      access: "export_only",
      nextChangeOn: null,
    });
    expect(await subscriptionOf(organizationId)).toMatchObject({
      status: "suspended",
      recorded: { status: "active" },
      manualSuspension: { by: adminUserId, reason: "Chargeback" },
      paidThrough: "2027-01-31",
    });
    expect((await subscriptionEntries(test, organizationId)).at(-1)).toMatchObject({
      action: "subscription.payment-recorded",
      before: { status: "suspended" },
      after: { status: "suspended" },
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
    const mistake = await pay(organizationId, "2027-10-31", { amountPaise: 25_000_000 });
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
