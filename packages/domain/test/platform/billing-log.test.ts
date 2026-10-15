// Support's billing changes in the platform log as well as the organization's own (ADR 0020), so a super admin can
// review them without opening each organization's log: time given, a payment voided, a plan changed and a
// cancellation, by who acted, with ids, days and amounts in paise, never a reason's words; and nothing for a change
// that changed nothing.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, calendarDateIn } from "../../src/kernel/index.js";
import {
  cancel,
  changePlan,
  listPlatformLog,
  onboardOrganization,
  recordPayment,
  setPaidThrough,
  voidPayment,
} from "../../src/platform/index.js";
import {
  createTestPlan,
  createTestPlatform,
  onboardingInput,
  support,
  supportUserId,
  type TestPlatform,
} from "./test-platform.js";

const today = () => calendarDateIn(new Date(), "Asia/Kolkata");

describe("support's billing changes in the platform log", () => {
  let test: TestPlatform;
  let plan: PlanSummary;
  let other: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
    other = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  /** The organization's billing entries in the platform log, oldest first. */
  async function billingLog(organizationId: string) {
    const page = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    return page.entries.filter((entry) => entry.action.startsWith("subscription.")).reverse();
  }

  it("logs time given, a voided payment, a plan change and a cancellation, by who acted, and no reasons", async () => {
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const target = { targetType: "subscription", targetId: organizationId, actorUserId: supportUserId };
    const given = addDays(today(), 60);
    await setPaidThrough(test.services, support, { organizationId, paidThrough: given, reason: "Goodwill for Asha" });
    const payment = await recordPayment(test.services, support, {
      organizationId,
      amountPaise: 250_000,
      paidOn: today(),
      paidThrough: addDays(today(), 30),
      reference: "UPI 6123",
    });
    await voidPayment(test.services, support, { organizationId, paymentId: payment.id, reason: "Asha paid twice" });
    await changePlan(test.services, support, { organizationId, planId: other.id, billingCycle: "monthly" });
    await cancel(test.services, support, { organizationId, reason: "Asha Sharma is closing down" });

    const entries = await billingLog(organizationId);
    expect(entries).toEqual([
      expect.objectContaining({
        ...target,
        action: "subscription.paid-through-changed",
        before: { paidThrough: null, status: "trial" },
        after: { paidThrough: given, status: "active" },
      }),
      expect.objectContaining({
        ...target,
        action: "subscription.payment-voided",
        before: null,
        after: { paymentId: payment.id, amountPaise: 250_000, paidOn: today(), paidThrough: addDays(today(), 30) },
      }),
      expect.objectContaining({
        ...target,
        action: "subscription.plan-changed",
        before: { planId: plan.id, billingCycle: "monthly" },
        after: { planId: other.id, billingCycle: "monthly" },
      }),
      expect.objectContaining({
        ...target,
        action: "subscription.cancelled",
        before: { status: "active" },
        after: { status: "cancelled" },
      }),
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Asha|Goodwill|twice|closing|UPI/);
  });

  it("logs nothing for a change that changed nothing", async () => {
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const given = { organizationId, paidThrough: addDays(today(), 45), reason: "Pilot" };
    await setPaidThrough(test.services, support, given);
    await setPaidThrough(test.services, support, given);
    const payment = await recordPayment(test.services, support, {
      organizationId,
      amountPaise: 100_000,
      paidOn: today(),
      paidThrough: addDays(today(), 45),
      reference: null,
    });
    const voiding = { organizationId, paymentId: payment.id, reason: "Mistake" };
    await voidPayment(test.services, support, voiding);
    await voidPayment(test.services, support, voiding);
    await changePlan(test.services, support, { organizationId, planId: plan.id, billingCycle: "monthly" });
    await cancel(test.services, support, { organizationId, reason: "Closing" });
    await cancel(test.services, support, { organizationId, reason: "Closing" });
    expect((await billingLog(organizationId)).map((entry) => entry.action)).toEqual([
      "subscription.paid-through-changed",
      "subscription.payment-voided",
      "subscription.cancelled",
    ]);
  });
});
