// The plans' and subscriptions' contracts: a plan is a flat tier with a monthly and an annual price before GST, its
// seats, storage in GB and modules, and a price for each extra seat; console changes name the organization, carry real
// dates, and say why when a person overrides the lifecycle.
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
  monthlyPricePaise: 199_900,
  annualPricePaise: 1_999_000,
  includedSeats: 3,
  extraSeatMonthlyPricePaise: 49_900,
  extraSeatAnnualPricePaise: 499_000,
  whatsappNumberLimit: 1,
  storageGb: 5,
  modules: ["crm", "quotes"],
};

describe("plan contracts", () => {
  it("takes a plan with both prices, its seats, an extra seat's prices, storage in GB and known modules", () => {
    expect(createPlanInput.parse(starter)).toEqual(starter);
    expect(createPlanInput.safeParse({ ...starter, extraSeatMonthlyPricePaise: 0 }).success).toBe(true);
  });

  it("refuses a plan without both prices, and bad keys, limits and modules, and unknown fields", () => {
    for (const bad of [
      { ...starter, annualPricePaise: null },
      { ...starter, monthlyPricePaise: undefined },
      { ...starter, extraSeatAnnualPricePaise: undefined },
      { ...starter, key: "Starter" },
      { ...starter, key: "s" },
      { ...starter, includedSeats: 0 },
      { ...starter, storageGb: 0 },
      { ...starter, storageGb: 2.5 },
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
  it("starts on the policy's trial, a trial to a real day, or paid through one, billed monthly or annually", () => {
    const trial = { planId: organizationId, billingCycle: "monthly", trialEndsOn: "2026-10-30", paidThrough: null };
    expect(startSubscriptionInput.parse(trial)).toEqual(trial);
    expect(startSubscriptionInput.parse({ planId: organizationId, billingCycle: "annual" })).toEqual({
      planId: organizationId,
      billingCycle: "annual",
      paidThrough: null,
    });
    expect(startSubscriptionInput.safeParse({ ...trial, trialEndsOn: "2026-02-30" }).success).toBe(false);
    expect(startSubscriptionInput.safeParse({ ...trial, billingCycle: "yearly" }).success).toBe(false);
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

  it("sets the trial's days with the past-due and read-only days", () => {
    const policy = { trialDays: 7, pastDueDays: 7, readOnlyDays: 14 };
    expect(setSubscriptionPolicyInput.parse(policy)).toEqual(policy);
    expect(setSubscriptionPolicyInput.safeParse({ ...policy, trialDays: 0 }).success).toBe(false);
    expect(setSubscriptionPolicyInput.safeParse({ pastDueDays: 7, readOnlyDays: 14 }).success).toBe(false);
  });
});
