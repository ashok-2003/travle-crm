// The subscription forms' values become subscriptions.*'s inputs by the api's own schemas: rupees as people type them
// read into paise exactly, a blank optional box as none, and every problem named on its field before anything is
// sent.
import { describe, expect, it } from "vitest";
import {
  toChangePlanInput,
  toEndAccessInput,
  toOverridesInput,
  toPaidThroughInput,
  toRecordPaymentInput,
  toTrialEndInput,
  toVoidPaymentInput,
} from "@/console/organizations/subscription/change-inputs";
import { groupedRupees } from "@/console/organizations/fields/money-field";

const organizationId = "0199a000-0000-7000-8000-000000000002";
const paymentId = "0199a000-0000-7000-8000-0000000000f1";

describe("the subscription forms' inputs", () => {
  it("read a payment's rupees into paise, and a blank reference as none", () => {
    expect(
      toRecordPaymentInput(organizationId, {
        amount: "₹2,950.50",
        paidOn: "2026-10-16",
        paidThrough: "2026-11-30",
        reference: " ",
      }),
    ).toEqual({
      ok: true,
      input: { organizationId, amountPaise: 295_050, paidOn: "2026-10-16", paidThrough: "2026-11-30", reference: null },
    });
  });

  it("name a payment's problems on their fields", () => {
    expect(toRecordPaymentInput(organizationId, { amount: "", paidOn: "", paidThrough: "", reference: "" })).toEqual({
      ok: false,
      problems: { amount: "required", paidOn: "required", paidThrough: "required" },
    });
    expect(
      toRecordPaymentInput(organizationId, {
        amount: "two thousand",
        paidOn: "2026-02-30",
        paidThrough: "2026-11-30",
        reference: "x".repeat(101),
      }),
    ).toEqual({ ok: false, problems: { amount: "amountInvalid", paidOn: "dateInvalid", reference: "tooLong" } });
    expect(
      toRecordPaymentInput(organizationId, {
        amount: "0",
        paidOn: "2026-10-16",
        paidThrough: "2026-11-30",
        reference: "",
      }),
    ).toEqual({ ok: false, problems: { amount: "amountInvalid" } });
  });

  it("read the overrides: seats as a whole number, a blank agreed price as the plan's, modules as chosen", () => {
    expect(toOverridesInput(organizationId, { extraSeats: "2", customPrice: "", extraModules: ["crm"] })).toEqual({
      ok: true,
      input: { organizationId, extraSeats: 2, customPricePaise: null, extraModules: ["crm"] },
    });
    expect(toOverridesInput(organizationId, { extraSeats: "0", customPrice: "1,999", extraModules: [] })).toMatchObject(
      {
        ok: true,
        input: { customPricePaise: 199_900 },
      },
    );
    expect(toOverridesInput(organizationId, { extraSeats: "1.5", customPrice: "lots", extraModules: [] })).toEqual({
      ok: false,
      problems: { extraSeats: "seatsInvalid", customPrice: "amountInvalid" },
    });
  });

  it("read a plan, a trial's end and a paid-through day with its reason", () => {
    expect(toChangePlanInput(organizationId, { planId: "", billingCycle: "monthly" })).toEqual({
      ok: false,
      problems: { planId: "required" },
    });
    expect(toTrialEndInput(organizationId, { trialEndsOn: "2026-11-30" })).toEqual({
      ok: true,
      input: { organizationId, trialEndsOn: "2026-11-30" },
    });
    expect(toPaidThroughInput(organizationId, { paidThrough: "2026-12-31", reason: "" })).toEqual({
      ok: false,
      problems: { reason: "required" },
    });
  });

  it("ask a reason of every suspension, cancellation and void, at most 200 characters", () => {
    expect(toEndAccessInput(organizationId, { reason: " Chargeback " })).toEqual({
      ok: true,
      input: { organizationId, reason: "Chargeback" },
    });
    expect(toEndAccessInput(organizationId, { reason: "x".repeat(201) })).toEqual({
      ok: false,
      problems: { reason: "tooLong" },
    });
    expect(toVoidPaymentInput(organizationId, paymentId, { reason: "Entered twice" })).toEqual({
      ok: true,
      input: { organizationId, paymentId, reason: "Entered twice" },
    });
  });

  it("group a typed amount the Indian way once the person moves on", () => {
    expect(groupedRupees("250000")).toBe("2,50,000");
    expect(groupedRupees("1250.5")).toBe("1,250.50");
    expect(groupedRupees("lots")).toBe("lots");
  });
});
