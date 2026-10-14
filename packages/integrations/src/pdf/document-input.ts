// What a PDF template is given: the document's content, already formatted, and the organization's branding.

/** An organization's own branding on its documents (spec 9.3). Not the product's brand: these are its settings. */
export interface DocumentBranding {
  organizationName: string;
  /** "#rrggbb". Replaces the brand's action colour on this organization's documents. */
  accentColour?: string | undefined;
  logo?: { data: Uint8Array; contentType: "image/png" | "image/jpeg" } | undefined;
  /** The organization's terms, printed after the content. */
  terms?: string | undefined;
}

/**
 * The sample template's content. Amounts and dates arrive as text, formatted by the caller (₹12,50,000.00,
 * 15 Oct 2026): templates know no money or date rules.
 */
export interface SampleDocumentData {
  title: string;
  number: string;
  issuedOn: string;
  recipient: { name: string; lines: string[] };
  rows: { description: string; detail?: string | undefined; amount: string }[];
  totals: { label: string; amount: string; emphasis?: boolean | undefined }[];
  notes?: string | undefined;
}

/** The templates the renderer knows. The Foundation ships one sample; quotes and invoices add theirs later. */
export type PdfTemplate = "sample";

export interface PdfInput {
  data: SampleDocumentData;
  branding: DocumentBranding;
}
