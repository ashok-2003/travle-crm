// Every change platform staff make to a subscription or its billing goes in the platform log as well as the
// organization's own (ADR 0020), so a super admin can review all of them without opening each organization's log:
// the terms it starts on, a trial moved, overrides, payments and voids, time given, a plan changed, a suspension and
// its lifting, a cancellation. By who acted, with ids, days and amounts in paise, never a reason's or a reference's
// words; and nothing for a change that changed nothing.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, calendarDateIn } from "../../src/kernel/index.js";
import {
  cancel,
  changePlan,
  liftSuspension,
  listPlatformLog,
  onboardOrganization,
  recordPayment,
  setOverrides,
  setPaidThrough,
  setTrialEnd,
  suspend,
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
const superAdmin = { userId: "0199e7a0-0000-7000-8000-00000000a11d" };

describe("platform staff's billing changes in the platform log", () => {
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

  /** The organization's platform log, oldest first. */
  async function platformLog(organizationId: string) {
    const page = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    return page.entries.reverse();
  }

  /** Its billing entries alone. */
  const billingLog = async (organizationId: string) =>
    (await platformLog(organizationId)).filter((entry) => entry.action.startsWith("subscription."));

  /** An entry about the organization's subscription, by `actorUserId` (support unless given). */
  const entry = (organizationId: string, change: object, actorUserId = supportUserId) =>
    expect.objectContaining({
      targetType: "subscription",
      targetId: organizationId,
      actorUserId,
      ...change,
    }) as unknown;

  it("logs the terms it starts on, a trial moved, overrides, and a payment and its void", async () => {
    const { organizationId, code } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const [onboarded] = await platformLog(organizationId);
    expect(onboarded?.after).toEqual({
      code,
      planId: plan.id,
      billingCycle: "monthly",
      status: "trial",
      trialEndsOn: addDays(today(), 30),
      paidThrough: null,
    });
    await setTrialEnd(test.services, support, { organizationId, trialEndsOn: addDays(today(), 40) });
    await setOverrides(test.services, support, {
      organizationId,
      extraSeats: 2,
      customPricePaise: 199_900,
      extraModules: ["quotes"],
    });
    const paid = { amountPaise: 250_000, paidOn: today(), paidThrough: addDays(today(), 30) };
    const payment = await recordPayment(test.services, support, { organizationId, ...paid, reference: "UPI Asha" });
    await voidPayment(test.services, support, { organizationId, paymentId: payment.id, reason: "Asha paid twice" });

    const entries = await billingLog(organizationId);
    expect(entries).toEqual([
      entry(organizationId, {
        action: "subscription.trial-end-changed",
        before: { trialEndsOn: addDays(today(), 30), status: "trial" },
        after: { trialEndsOn: addDays(today(), 40), status: "trial" },
      }),
      entry(organizationId, {
        action: "subscription.overrides-changed",
        before: { extraSeats: 0, customPricePaise: null, extraModules: [] },
        after: { extraSeats: 2, customPricePaise: 199_900, extraModules: ["quotes"] },
      }),
      entry(organizationId, {
        action: "subscription.payment-recorded",
        before: { paidThrough: null, status: "trial" },
        after: {
          paymentId: payment.id,
          amountPaise: 250_000,
          paidOn: today(),
          paysThrough: paid.paidThrough,
          paidThrough: paid.paidThrough,
          status: "active",
        },
      }),
      entry(organizationId, {
        action: "subscription.payment-voided",
        before: null,
        after: { paymentId: payment.id, ...paid },
      }),
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Asha|twice|UPI/);
  });

  it("logs time given, a plan change, a suspension, its lifting by a super admin, and a cancellation", async () => {
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const given = addDays(today(), 60);
    await setPaidThrough(test.services, support, { organizationId, paidThrough: given, reason: "Goodwill for Asha" });
    await changePlan(test.services, support, { organizationId, planId: other.id, billingCycle: "monthly" });
    await suspend(test.services, support, { organizationId, reason: "Asha's cheque bounced" });
    await liftSuspension(test.services, superAdmin, { organizationId, reason: "Asha paid in cash" });
    await cancel(test.services, support, { organizationId, reason: "Asha Sharma is closing down" });

    const entries = await billingLog(organizationId);
    expect(entries).toEqual([
      entry(organizationId, {
        action: "subscription.paid-through-changed",
        before: { paidThrough: null, status: "trial" },
        after: { paidThrough: given, status: "active" },
      }),
      entry(organizationId, {
        action: "subscription.plan-changed",
        before: { planId: plan.id, billingCycle: "monthly" },
        after: { planId: other.id, billingCycle: "monthly" },
      }),
      entry(organizationId, {
        action: "subscription.suspended",
        before: { status: "active", suspendedByHand: false },
        after: { status: "suspended", suspendedByHand: true },
      }),
      entry(
        organizationId,
        {
          action: "subscription.suspension-lifted",
          before: { status: "suspended", suspendedByHand: true },
          after: { status: "active", suspendedByHand: false },
        },
        superAdmin.userId,
      ),
      entry(organizationId, {
        action: "subscription.cancelled",
        before: { status: "active" },
        after: { status: "cancelled" },
      }),
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Asha|Goodwill|cheque|cash|closing/);
  });

  it("logs nothing for a change that changed nothing", async () => {
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const trialEnd = { organizationId, trialEndsOn: addDays(today(), 20) };
    await setTrialEnd(test.services, support, trialEnd);
    await setTrialEnd(test.services, support, trialEnd);
    const overrides = { organizationId, extraSeats: 1, customPricePaise: null, extraModules: [] };
    await setOverrides(test.services, support, overrides);
    await setOverrides(test.services, support, overrides);
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
    const reason = { organizationId, reason: "Checking" };
    await liftSuspension(test.services, superAdmin, reason);
    await suspend(test.services, support, reason);
    await suspend(test.services, support, reason);
    await liftSuspension(test.services, superAdmin, reason);
    await liftSuspension(test.services, superAdmin, reason);
    await cancel(test.services, support, reason);
    await cancel(test.services, support, reason);
    expect((await billingLog(organizationId)).map((logged) => logged.action)).toEqual([
      "subscription.trial-end-changed",
      "subscription.overrides-changed",
      "subscription.paid-through-changed",
      "subscription.payment-recorded",
      "subscription.payment-voided",
      "subscription.suspended",
      "subscription.suspension-lifted",
      "subscription.cancelled",
    ]);
  });
});
