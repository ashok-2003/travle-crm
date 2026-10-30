// The business profile's contract: a GSTIN of the profile's own state, Indian bank codes and phones, a numbering
// prefix and a colour, each in the form the database stores; blank text is no text.
import { describe, expect, it } from "vitest";
import { reservedDocumentPrefixes } from "../../src/documents/index.js";
import {
  saveBrandingInput,
  saveOrganizationProfileInput,
  updateOrganizationProfileInput,
} from "../../src/profile/index.js";

const profile = {
  legalName: "Sharma Holidays Private Limited",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "12 Marine Drive, Mumbai 400002",
  contactName: "Asha Sharma",
  contactPhone: "98765 43210",
  bankAccountName: "Sharma Holidays Pvt Ltd",
  bankAccountNumber: "001234567890",
  bankIfsc: "hdfc0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "sh",
  brandColour: "#1F6F5C",
  documentTerms: "  ",
};

describe("business profile contracts", () => {
  it("stores what people type in the database's forms", () => {
    expect(saveOrganizationProfileInput.parse(profile)).toMatchObject({
      contactPhone: "+919876543210",
      bankIfsc: "HDFC0001234",
      invoicePrefix: "SH",
      brandColour: "#1f6f5c",
      documentTerms: null,
    });
  });

  it("refuses a GSTIN of another state, and wrong codes, numbers, prefixes and colours", () => {
    const gstinElsewhere = saveOrganizationProfileInput.safeParse({ ...profile, gstStateCode: "29" });
    expect(gstinElsewhere.error?.issues[0]?.path).toEqual(["gstin"]);
    for (const bad of [
      { gstin: "27AAPFU0939F1ZX" },
      { bankIfsc: "HDFC1001234" },
      { bankAccountNumber: "12345" },
      { invoicePrefix: "S" },
      { invoicePrefix: "SHARMA" },
      { brandColour: "green" },
      { contactPhone: "12" },
      { gstStateCode: "99" },
    ]) {
      expect(saveOrganizationProfileInput.safeParse({ ...profile, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("refuses the prefixes of the platform's own documents, however they are typed", () => {
    for (const invoicePrefix of ["SMPL", "smpl", " Doc "]) {
      const parsed = saveOrganizationProfileInput.safeParse({ ...profile, invoicePrefix });
      expect(
        parsed.error?.issues.map((issue) => issue.path),
        invoicePrefix,
      ).toEqual([["invoicePrefix"]]);
    }
    expect(reservedDocumentPrefixes).toEqual(["SMPL", "DOC", "QT", "RCT", "BK", "VCH", "ITN"]);
    expect(saveOrganizationProfileInput.parse({ ...profile, invoicePrefix: "smp" }).invoicePrefix).toBe("SMP");
  });

  it("turns every blank optional field into null, as a form posting empty boxes would", () => {
    const blank = {
      ...profile,
      gstin: "",
      address: " ",
      contactName: "",
      contactPhone: "  ",
      bankAccountName: "",
      bankAccountNumber: "",
      bankIfsc: "",
      bankName: "",
      invoicePrefix: "",
      brandColour: "",
      documentTerms: "",
    };
    expect(saveOrganizationProfileInput.parse(blank)).toEqual({
      legalName: profile.legalName,
      gstStateCode: "27",
      gstin: null,
      address: null,
      contactName: null,
      contactPhone: null,
      bankAccountName: null,
      bankAccountNumber: null,
      bankIfsc: null,
      bankName: null,
      invoicePrefix: null,
      brandColour: null,
      documentTerms: null,
    });
    // The legal name is not optional.
    expect(saveOrganizationProfileInput.safeParse({ ...profile, legalName: " " }).success).toBe(false);
  });

  it("takes an account number as it is printed on a cheque", () => {
    for (const printed of ["0012 3456 7890", "0012-3456-7890", " 001234567890 "]) {
      expect(saveOrganizationProfileInput.parse({ ...profile, bankAccountNumber: printed }).bankAccountNumber).toBe(
        "001234567890",
      );
    }
    expect(saveOrganizationProfileInput.safeParse({ ...profile, bankAccountNumber: "0012 3456 78A0" }).success).toBe(
      false,
    );
  });

  it("takes an agency without GST registration or bank details yet", () => {
    const minimal = { ...profile, gstin: null, bankAccountNumber: null, bankIfsc: null, bankAccountName: null };
    expect(saveOrganizationProfileInput.safeParse(minimal).success).toBe(true);
    expect(saveOrganizationProfileInput.safeParse({ ...minimal, website: "x" }).success).toBe(false);
  });

  it("keeps the business details and the branding apart", () => {
    const { brandColour, documentTerms, ...business } = profile;
    expect(updateOrganizationProfileInput.safeParse(business).success).toBe(true);
    expect(updateOrganizationProfileInput.safeParse(profile).success).toBe(false);
    expect(saveBrandingInput.parse({ brandColour, documentTerms })).toEqual({
      brandColour: "#1f6f5c",
      documentTerms: null,
    });
    expect(saveBrandingInput.safeParse({ brandColour, documentTerms, address: "x" }).success).toBe(false);
  });
});
