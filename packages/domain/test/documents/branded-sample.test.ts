// The sample quotation an organization previews its branding on: its name, colour, terms and logo, made-up lines
// taxed in its own state, and nothing the organization didn't set.
import { describe, expect, it } from "vitest";
import { brandedSampleQuotation, SAMPLE_PREFIX } from "../../src/documents/index.js";

const profile = { gstStateCode: "29", brandColour: "#1f6f5c", documentTerms: "50% to book." };

describe("brandedSampleQuotation", () => {
  it("carries the organization's branding, its logo among it", () => {
    const sample = brandedSampleQuotation({
      organizationName: "Konkan Trails",
      profile,
      logoAttachmentId: "0199e7a0-0000-7000-8000-00000000a001",
    });
    expect(sample.branding).toEqual({
      organizationName: "Konkan Trails",
      accentColour: "#1f6f5c",
      terms: "50% to book.",
      logoAttachmentId: "0199e7a0-0000-7000-8000-00000000a001",
    });
    expect(sample.template).toBe("sample");
    expect(sample.content.title).toBe("Quotation");
    expect(sample.content.notes).toMatch(/sample/i);
  });

  it("taxes its lines within the organization's own state: CGST and SGST", () => {
    const labels = brandedSampleQuotation({ organizationName: "Konkan Trails", profile }).content.totals.map(
      (total) => total.label,
    );
    expect(labels).toContain("CGST 2.5 %");
    expect(labels).toContain("SGST 2.5 %");
    expect(labels).not.toContain("IGST 5 %");
  });

  it("leaves out what the organization didn't set", () => {
    const sample = brandedSampleQuotation({
      organizationName: "Konkan Trails",
      profile: { gstStateCode: "27", brandColour: null, documentTerms: null },
    });
    expect(sample.branding).toEqual({ organizationName: "Konkan Trails" });
  });

  it("is numbered with its own prefix, apart from real documents", () => {
    expect(SAMPLE_PREFIX).toMatch(/^[A-Z]{2,5}$/);
    expect(SAMPLE_PREFIX).toBe("SMPL");
  });
});
