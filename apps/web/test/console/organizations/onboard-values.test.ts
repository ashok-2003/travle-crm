// The onboarding form's values become organizations.onboard's input by the api's own schema: blank optional boxes are
// no value, the subscription starts as the person chose (the usual trial, a trial to a day, or paid through a day),
// and every problem is named on the field it belongs to, a GSTIN of another state among them, before anything is sent.
import { describe, expect, it } from "vitest";
import {
  emptyOnboardValues,
  toOnboardInput,
  type OnboardValues,
} from "@/console/organizations/onboarding/onboard-values";

const planId = "0199a000-0000-7000-8000-0000000000c1";

function filled(overrides: Partial<OnboardValues> = {}): OnboardValues {
  return {
    ...emptyOnboardValues(),
    name: "Kerala Trails",
    code: "kerala",
    contactEmail: "Hello@KeralaTrails.example",
    legalName: "Kerala Trails LLP",
    gstStateCode: "32",
    ownerName: "Lakshmi Nair",
    ownerEmail: "lakshmi@keralatrails.example",
    planId,
    billingCycle: "monthly",
    ...overrides,
  };
}

describe("toOnboardInput", () => {
  it("starts empty, in India's time zone, on the usual trial", () => {
    expect(emptyOnboardValues()).toMatchObject({ timeZone: "Asia/Kolkata", start: "trial", gstin: "", planId: "" });
  });

  it("reads the form as the api's input, blank optional boxes as no value, the usual trial left to the policy", () => {
    expect(toOnboardInput(filled())).toEqual({
      ok: true,
      input: {
        name: "Kerala Trails",
        code: "KERALA",
        timeZone: "Asia/Kolkata",
        contactEmail: "hello@keralatrails.example",
        profile: {
          legalName: "Kerala Trails LLP",
          gstin: null,
          gstStateCode: "32",
          contactName: null,
          contactPhone: null,
        },
        owner: { name: "Lakshmi Nair", email: "lakshmi@keralatrails.example" },
        subscription: { planId, billingCycle: "monthly", paidThrough: null },
      },
    });
  });

  it("keeps a GSTIN of the state chosen, and the contact's name and phone in E.164", () => {
    const result = toOnboardInput(
      filled({ gstin: "32aapfu0939f1z4", contactName: "Lakshmi Nair", contactPhone: "98765 43210" }),
    );
    expect(result).toMatchObject({
      ok: true,
      input: { profile: { gstin: "32AAPFU0939F1Z4", contactName: "Lakshmi Nair", contactPhone: "+919876543210" } },
    });
  });

  it("starts a trial to the day chosen, or active and paid through one", () => {
    expect(toOnboardInput(filled({ start: "trial-until", trialEndsOn: "2026-11-30" }))).toMatchObject({
      ok: true,
      input: { subscription: { trialEndsOn: "2026-11-30", paidThrough: null } },
    });
    expect(
      toOnboardInput(filled({ start: "paid", paidThrough: "2027-03-31", trialEndsOn: "2026-11-30" })),
    ).toMatchObject({ ok: true, input: { subscription: { trialEndsOn: null, paidThrough: "2027-03-31" } } });
  });

  it("refuses a GSTIN of another state before anything is sent", () => {
    expect(toOnboardInput(filled({ gstin: "27AAPFU0939F1ZV" }))).toEqual({
      ok: false,
      problems: { gstin: "gstinOtherState" },
    });
    expect(toOnboardInput(filled({ gstin: "32AAPFU0939F1Z5" }))).toEqual({
      ok: false,
      problems: { gstin: "gstinInvalid" },
    });
  });

  it("asks for the day a trial ends or a payment runs to, when the start needs one", () => {
    expect(toOnboardInput(filled({ start: "trial-until" }))).toEqual({
      ok: false,
      problems: { trialEndsOn: "dateRequired" },
    });
    expect(toOnboardInput(filled({ start: "paid" }))).toEqual({ ok: false, problems: { paidThrough: "dateRequired" } });
  });

  it("names every problem on its own field", () => {
    expect(toOnboardInput(emptyOnboardValues())).toEqual({
      ok: false,
      problems: {
        name: "required",
        code: "required",
        contactEmail: "required",
        legalName: "required",
        gstStateCode: "required",
        ownerName: "required",
        ownerEmail: "required",
        planId: "required",
        billingCycle: "required",
      },
    });
    expect(
      toOnboardInput(
        filled({
          code: "K-1",
          contactEmail: "nobody",
          ownerEmail: "owner@placeholder.invalid",
          contactPhone: "12",
          contactName: "\u202Eevil",
        }),
      ),
    ).toEqual({
      ok: false,
      problems: {
        code: "codeInvalid",
        contactEmail: "emailInvalid",
        ownerEmail: "emailInvalid",
        contactPhone: "phoneInvalid",
        contactName: "nameInvalid",
      },
    });
  });
});
