// The plans' and subscriptions' contracts: a plan is a tier priced per organization monthly, yearly or both, before
// GST, limited, on known modules, and may sell extra seats; console changes name the organization, carry real dates,
// and say why when a person overrides the lifecycle; the policy holds the trial's days beside the unpaid states'.
import { describe, expect, it } from "vitest";
import {
  createPlanInput,
  recordPaymentInput,
  setOverridesInput,
  setPaidThroughInput,
  setSubscriptionPolicyInput,
  startSubscriptionInput,
  updatePlanInput,
} from "../../src/subscriptions/index.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000d1";
const starter = {
  key: "starter",
  name: "Starter",
  monthlyPricePaise: 250_000,
  yearlyPricePaise: null,
  seatLimit: 5,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5_000_000_000,
  modules: ["crm", "quotes"],
};

describe("plan contracts", () => {
  it("takes a plan priced monthly, yearly or both, with limits and known modules", () => {
    expect(createPlanInput.parse(starter)).toEqual(starter);
    expect(
      createPlanInput.safeParse({ ...starter, monthlyPricePaise: null, yearlyPricePaise: 2_500_000 }).success,
    ).toBe(true);
    const unpriced = createPlanInput.safeParse({ ...starter, monthlyPricePaise: null });
    expect(unpriced.error?.issues[0]?.path).toEqual(["monthlyPricePaise"]);
  });

  it("sells extra seats above the plan's, per month and per year, or not at all", () => {
    const withSeats = { ...starter, extraSeatMonthlyPricePaise: 29_900, extraSeatYearlyPricePaise: null };
    expect(createPlanInput.parse(withSeats)).toEqual(withSeats);
    expect(createPlanInput.safeParse({ ...starter, extraSeatMonthlyPricePaise: -1 }).success).toBe(false);
  });

  it("refuses bad keys, limits and modules, and unknown fields", () => {
    for (const bad of [
      { ...starter, key: "Starter" },
      { ...starter, key: "s" },
      { ...starter, seatLimit: 0 },
      { ...starter, monthlyPricePaise: 99.5 },
      { ...starter, modules: ["crm", "teleport"] },
      { ...starter, discount: 10 },
    ]) {
      expect(createPlanInput.safeParse(bad).success).toBe(false);
    }
  });

  it("never changes a plan's key", () => {
    const { key, ...fields } = starter;
    expect(key).toBe("starter");
    expect(updatePlanInput.safeParse({ planId: organizationId, ...fields }).success).toBe(true);
    expect(updatePlanInput.safeParse({ planId: organizationId, ...fields, key: "pro" }).success).toBe(false);
  });
});

describe("subscription contracts", () => {
  it("starts on the policy's trial, a trial to a real day, or paid through one", () => {
    const trial = { planId: organizationId, billingCycle: "monthly", trialEndsOn: "2026-10-30", paidThrough: null };
    expect(startSubscriptionInput.parse(trial)).toEqual(trial);
    const policysTrial = { planId: organizationId, billingCycle: "yearly", paidThrough: null };
    expect(startSubscriptionInput.parse(policysTrial)).toEqual(policysTrial);
    expect(startSubscriptionInput.safeParse({ ...trial, trialEndsOn: "2026-02-30" }).success).toBe(false);
    expect(startSubscriptionInput.safeParse({ ...trial, billingCycle: "weekly" }).success).toBe(false);
  });

  it("takes overrides within bounds", () => {
    const overrides = { organizationId, extraSeats: 3, customPricePaise: null, extraModules: ["accounts"] };
    expect(setOverridesInput.parse(overrides)).toEqual(overrides);
    expect(setOverridesInput.safeParse({ ...overrides, extraSeats: -1 }).success).toBe(false);
  });

  it("records a payment of at least a paisa through a day from the day it was paid, and asks why time is given", () => {
    const payment = {
      organizationId,
      amountPaise: 250_000,
      paidOn: "2026-10-16",
      paidThrough: "2026-11-15",
      reference: "NEFT UTR 412345678901",
    };
    expect(recordPaymentInput.parse(payment)).toEqual(payment);
    expect(recordPaymentInput.safeParse({ ...payment, paidThrough: "2026-10-16" }).success).toBe(true);
    expect(recordPaymentInput.safeParse({ ...payment, amountPaise: 0 }).success).toBe(false);
    const backwards = recordPaymentInput.safeParse({ ...payment, paidThrough: "2026-10-15" });
    expect(backwards.error?.issues[0]?.path).toEqual(["paidThrough"]);
    expect(setPaidThroughInput.safeParse({ organizationId, paidThrough: "2026-12-31", reason: " " }).success).toBe(
      false,
    );
    expect(setPaidThroughInput.safeParse({ organizationId, paidThrough: "2026-12-31", reason: "Pilot" }).success).toBe(
      true,
    );
  });

  it("holds the trial's days and the unpaid states' days, each within bounds", () => {
    const policy = { trialDays: 7, pastDueDays: 7, readOnlyDays: 14 };
    expect(setSubscriptionPolicyInput.parse(policy)).toEqual(policy);
    expect(setSubscriptionPolicyInput.safeParse({ ...policy, trialDays: 0 }).success).toBe(false);
    expect(setSubscriptionPolicyInput.safeParse({ pastDueDays: 7, readOnlyDays: 14 }).success).toBe(false);
  });
});
