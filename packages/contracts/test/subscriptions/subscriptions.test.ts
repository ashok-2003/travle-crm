// The plans' and subscriptions' contracts: a plan is priced one way or both, limited, and on known modules; console
// changes name the organization, carry real dates, and say why when a person overrides the lifecycle.
import { describe, expect, it } from "vitest";
import {
  createPlanInput,
  recordPaymentInput,
  setOverridesInput,
  setPaidThroughInput,
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
  it("starts on a trial to a real day, or paid through one", () => {
    const trial = { planId: organizationId, billingCycle: "monthly", trialEndsOn: "2026-10-30", paidThrough: null };
    expect(startSubscriptionInput.parse(trial)).toEqual(trial);
    expect(startSubscriptionInput.safeParse({ ...trial, trialEndsOn: "2026-02-30" }).success).toBe(false);
    expect(startSubscriptionInput.safeParse({ ...trial, billingCycle: "weekly" }).success).toBe(false);
  });

  it("takes overrides within bounds", () => {
    const overrides = { organizationId, extraSeats: 3, customPricePaise: null, extraModules: ["accounts"] };
    expect(setOverridesInput.parse(overrides)).toEqual(overrides);
    expect(setOverridesInput.safeParse({ ...overrides, extraSeats: -1 }).success).toBe(false);
  });

  it("records a payment of at least a paisa, and asks why access is given without one", () => {
    const payment = {
      organizationId,
      amountPaise: 250_000,
      paidOn: "2026-10-16",
      paidThrough: "2026-11-15",
      reference: "NEFT UTR 412345678901",
    };
    expect(recordPaymentInput.parse(payment)).toEqual(payment);
    expect(recordPaymentInput.safeParse({ ...payment, amountPaise: 0 }).success).toBe(false);
    expect(setPaidThroughInput.safeParse({ organizationId, paidThrough: "2026-12-31", reason: " " }).success).toBe(
      false,
    );
    expect(setPaidThroughInput.safeParse({ organizationId, paidThrough: "2026-12-31", reason: "Pilot" }).success).toBe(
      true,
    );
  });
});
