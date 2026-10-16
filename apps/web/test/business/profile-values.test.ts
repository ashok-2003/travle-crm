// The business profile form speaks the api's own rules (updateOrganizationProfileInput): what it sends is what the api
// keeps, a blank box is no value, and each problem is named by the field it belongs to, a GSTIN of another state among
// them, so the form can say which state the GSTIN is registered in.
import type { BusinessProfileDetails } from "@travel-crm/contracts/profile";
import { describe, expect, it } from "vitest";
import {
  profileValuesOf,
  stateNameOfGstin,
  toProfileInput,
  type ProfileValues,
} from "@/business/profile/profile-values";

const saved: BusinessProfileDetails = {
  legalName: "Konkan Trails LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "12 Hill Road, Bandra, Mumbai 400050",
  contactName: "Lakshmi Nair",
  contactPhone: "+919820012345",
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  bankName: null,
  invoicePrefix: null,
  updatedAt: "2026-10-16T05:00:00.000Z",
};

const filled: ProfileValues = {
  legalName: "Konkan Trails LLP",
  gstin: "27aapfu0939f1zv",
  gstStateCode: "27",
  address: "12 Hill Road, Bandra, Mumbai 400050",
  contactName: "Lakshmi Nair",
  contactPhone: "98200 12345",
  bankAccountName: "Konkan Trails LLP",
  bankAccountNumber: "0012 3456 7890",
  bankIfsc: "hdfc0001234",
  bankName: "  ",
  invoicePrefix: "kt",
};

/** A Karnataka GSTIN: well formed, with its check character, but not Maharashtra's. */
const KARNATAKA_GSTIN = "29AAPFU0939F1ZR";

describe("profileValuesOf", () => {
  it("fills the form from the saved profile: a blank for what isn't there, an Indian phone without its +91", () => {
    expect(profileValuesOf(saved)).toEqual({
      legalName: "Konkan Trails LLP",
      gstin: "27AAPFU0939F1ZV",
      gstStateCode: "27",
      address: "12 Hill Road, Bandra, Mumbai 400050",
      contactName: "Lakshmi Nair",
      contactPhone: "98200 12345",
      bankAccountName: "",
      bankAccountNumber: "",
      bankIfsc: "",
      bankName: "",
      invoicePrefix: "",
    });
  });

  it("keeps another country's number whole", () => {
    expect(profileValuesOf({ ...saved, contactPhone: "+442079460958" }).contactPhone).toBe("+442079460958");
  });

  it("starts empty, the state still to choose, before any profile was saved", () => {
    expect(Object.values(profileValuesOf(null))).toEqual(Array<string>(11).fill(""));
  });
});

describe("toProfileInput", () => {
  it("sends what the api keeps: capitals, the phone in E.164, the account's digits, and null for a blank box", () => {
    expect(toProfileInput(filled)).toEqual({
      ok: true,
      input: {
        legalName: "Konkan Trails LLP",
        gstin: "27AAPFU0939F1ZV",
        gstStateCode: "27",
        address: "12 Hill Road, Bandra, Mumbai 400050",
        contactName: "Lakshmi Nair",
        contactPhone: "+919820012345",
        bankAccountName: "Konkan Trails LLP",
        bankAccountNumber: "001234567890",
        bankIfsc: "HDFC0001234",
        bankName: null,
        invoicePrefix: "KT",
      },
    });
  });

  it("names each problem by its field", () => {
    const result = toProfileInput({
      ...filled,
      legalName: " ",
      gstin: "27AAPFU0939F1ZX",
      contactPhone: "12345",
      bankAccountNumber: "12",
      bankIfsc: "HDFC1234567",
      invoicePrefix: "K",
    });
    expect(result).toEqual({
      ok: false,
      problems: {
        legalName: "legalName",
        gstin: "gstin",
        contactPhone: "contactPhone",
        bankAccountNumber: "bankAccountNumber",
        bankIfsc: "bankIfsc",
        invoicePrefix: "invoicePrefix",
      },
    });
  });

  it("asks for the state when none was chosen", () => {
    expect(toProfileInput({ ...filled, gstStateCode: "" })).toEqual({
      ok: false,
      problems: { gstStateCode: "gstStateCode" },
    });
  });

  it("tells a GSTIN of another state from a mistyped one", () => {
    expect(toProfileInput({ ...filled, gstin: KARNATAKA_GSTIN })).toEqual({
      ok: false,
      problems: { gstin: "gstinOfAnotherState" },
    });
    expect(stateNameOfGstin(KARNATAKA_GSTIN.toLowerCase())).toBe("Karnataka");
    expect(stateNameOfGstin("29AAPFU0939F1ZX")).toBeNull();
  });

  it("lets a business without GST registration leave the GSTIN out", () => {
    expect(toProfileInput({ ...filled, gstin: "" })).toMatchObject({ ok: true, input: { gstin: null } });
  });
});
