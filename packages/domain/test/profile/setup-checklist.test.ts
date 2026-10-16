// The setup checklist (spec 7.1): each step is done only once its data is there, the steps come in the order an Owner
// takes them, and the checklist is done when every step is.
import type { OrganizationProfileDetails } from "@travel-crm/contracts/profile";
import { describe, expect, it } from "vitest";
import { setupChecklistOf, type SetupFacts } from "../../src/profile/index.js";

const complete: OrganizationProfileDetails = {
  legalName: "Kerala Trails LLP",
  gstin: null,
  gstStateCode: "32",
  address: "Fort Kochi",
  contactName: "Lakshmi Nair",
  contactPhone: "+919876543210",
  bankAccountName: null,
  bankAccountNumber: "001234567890",
  bankIfsc: "HDFC0001234",
  bankName: null,
  invoicePrefix: "KT",
  brandColour: "#1f6f5c",
  documentTerms: "Payment due on booking.",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const everything: SetupFacts = { profile: complete, activeStaff: 2, hasLogo: true };

const doneSteps = (facts: SetupFacts) =>
  setupChecklistOf(facts)
    .steps.filter((step) => step.done)
    .map((step) => step.step);

describe("the setup checklist", () => {
  it("lists every step to do, in the order an Owner takes them, before anything is saved", () => {
    expect(setupChecklistOf({ profile: null, activeStaff: 1, hasLogo: false })).toEqual({
      steps: [
        { step: "business-details", done: false },
        { step: "contact-phone", done: false },
        { step: "logo", done: false },
        { step: "branding", done: false },
        { step: "bank-details", done: false },
        { step: "invoice-prefix", done: false },
        { step: "staff", done: false },
      ],
      done: false,
    });
  });

  it("is done when every step is", () => {
    expect(setupChecklistOf(everything)).toMatchObject({ done: true });
    expect(doneSteps(everything)).toHaveLength(7);
  });

  // Each row misses one field: an && turned || would call a step of several fields done. A blank legal name stands for
  // one a form never sends (the contract trims and requires it).
  it.each([
    ["business-details", { legalName: " " }],
    ["business-details", { address: null }],
    ["contact-phone", { contactPhone: null }],
    ["bank-details", { bankAccountNumber: null }],
    ["bank-details", { bankIfsc: null }],
    ["invoice-prefix", { invoicePrefix: null }],
  ] as const)("does not call %s done when %o is missing", (step, missing) => {
    const facts = { ...everything, profile: { ...complete, ...missing } };
    expect(doneSteps(facts)).not.toContain(step);
    expect(doneSteps(facts)).toHaveLength(6);
    expect(setupChecklistOf(facts).done).toBe(false);
  });

  it("keeps the contact phone a step of its own: the business details are done without it", () => {
    const facts = { ...everything, profile: { ...complete, contactPhone: null } };
    expect(doneSteps(facts)).toContain("business-details");
  });

  // Branding needs only one of its two fields: an || turned && would refuse a colour alone.
  it.each([
    [{ brandColour: null }, true],
    [{ documentTerms: null }, true],
    [{ brandColour: null, documentTerms: null }, false],
  ] as const)("calls branding done for %o: %s", (missing, done) => {
    expect(doneSteps({ ...everything, profile: { ...complete, ...missing } }).includes("branding")).toBe(done);
  });

  it("calls the logo done once one is confirmed, whatever the profile says", () => {
    expect(doneSteps({ ...everything, hasLogo: false })).not.toContain("logo");
    expect(setupChecklistOf({ ...everything, hasLogo: false }).done).toBe(false);
    expect(doneSteps({ profile: null, activeStaff: 1, hasLogo: true })).toEqual(["logo"]);
  });

  it("counts the Owner alone as no staff yet", () => {
    expect(doneSteps({ ...everything, activeStaff: 1 })).not.toContain("staff");
    expect(doneSteps({ ...everything, activeStaff: 2 })).toContain("staff");
  });
});
