// The sample quotation an organization previews its branding on (spec 9.3): made-up lines taxed in its own state,
// with its name, colour, terms and logo, ready for issueDocument with the samples' own prefix. A sample is issued and
// kept like any document; its number says what it is.
import { SAMPLE_DOCUMENT_PREFIX, type IssueDocumentInput } from "@travel-crm/contracts/documents";
import type { OrganizationProfileDetails } from "@travel-crm/contracts/profile";
import { isGstStateCode, money } from "../kernel/index.js";
import { sampleQuotation } from "./sample-quotation.js";

/**
 * Samples are numbered apart from real documents: SMPL-2026-0001. No organization may choose it for its invoices
 * (the contracts' reservedDocumentPrefixes, and a CHECK in the database).
 */
export const SAMPLE_PREFIX = SAMPLE_DOCUMENT_PREFIX;

export interface SampleBranding {
  /** The organization's name, as its documents' header shows it. */
  organizationName: string;
  profile: Pick<OrganizationProfileDetails, "gstStateCode" | "brandColour" | "documentTerms">;
  /** The organization's current logo, frozen into the sample. */
  logoAttachmentId?: string | undefined;
}

export function brandedSampleQuotation({
  organizationName,
  profile,
  logoAttachmentId,
}: SampleBranding): IssueDocumentInput {
  const state = profile.gstStateCode;
  // The database holds only the kernel's state codes; anything else is a fault, not a person's mistake.
  if (!isGstStateCode(state)) throw new RangeError(`Not a GST state code: ${JSON.stringify(state)}`);
  return sampleQuotation({
    recipient: { name: "Meera Iyer", lines: ["A customer of yours"] },
    // Within the organization's own state: CGST and SGST, as most of its quotations will be.
    supplierStateCode: state,
    placeOfSupplyStateCode: state,
    lines: [
      {
        description: "Andaman islands, 6 nights",
        detail: "2 adults, sea-view room",
        // Tour operator services.
        sacCode: "998555",
        taxableValue: money(1_25_000_00),
        rateBasisPoints: 500,
      },
      {
        description: "Airport transfers",
        detail: "Port Blair, both ways",
        sacCode: "996601",
        taxableValue: money(4_500_00),
        rateBasisPoints: 1800,
      },
    ],
    branding: {
      organizationName,
      ...(profile.brandColour === null ? {} : { accentColour: profile.brandColour }),
      ...(profile.documentTerms === null ? {} : { terms: profile.documentTerms }),
      ...(logoAttachmentId === undefined ? {} : { logoAttachmentId }),
    },
    notes: "A sample, to show how your quotations look. It is not an offer.",
  });
}
