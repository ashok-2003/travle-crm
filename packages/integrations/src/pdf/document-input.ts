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

/** The quotation template's content, in the words it prints: the caller formats every date and amount. */
export interface QuotationDocumentData {
  title: string;
  number: string;
  issuedOn: string;
  customer: string;
  /** The Pay box: the UPI link drawn as a QR (when given), the UPI id and name, and the amount due now. */
  pay?: { link?: string | undefined; upiId: string; name: string; amount: string } | undefined;
  when?: string | undefined;
  lines: { description: string; detail?: string | undefined; amount: string }[];
  gst?: { label: string; amount: string } | undefined;
  total: string;
  totalNote?: string | undefined;
  dues: { label: string; by: string; amount: string }[];
  days: { title: string; description?: string | undefined }[];
  inclusions: string[];
  exclusions: string[];
  notes: string[];
}

/** The templates the renderer knows: the sample (also invoices and receipts) and the quotation's own. */
export type PdfTemplate = "sample" | "quotation";

export interface PdfInput {
  /** When the document was issued. Written into the file, so the same input always renders to the same bytes. */
  issuedAt: Date;
  data: SampleDocumentData | QuotationDocumentData;
  branding: DocumentBranding;
}
