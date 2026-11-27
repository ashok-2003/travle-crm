// Inputs and outputs for issued documents (spec 9.3): what a sample document says, the organization's branding on
// it, what is stored when it is issued, and the event that has the worker render it.
import { z } from "zod";

/** One line of text: trimmed, at least one character, no control characters at all. */
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !/\p{Cc}/u.test(text), "Use text without control characters");

/** A paragraph: like a line, but it may hold line breaks (and no other control character). */
const paragraph = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !/\p{Cc}/u.test(text.replaceAll("\n", "")), "Use text without control characters");

/** An amount as it is printed, already formatted by the caller, e.g. "₹12,50,000.00". */
const printedAmount = line(24);

/** The templates the renderer knows: the sample (invoices and receipts too) and the quotation's own. */
export const pdfTemplate = z.enum(["sample", "quotation"]);

/** The organization's own branding on a document, as it was when the document was issued. */
export const documentBranding = z.strictObject({
  organizationName: line(120),
  accentColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1a2b3c")
    .optional(),
  terms: paragraph(2000).optional(),
  /** The organization's logo (an organization_logo attachment), which the worker reads from storage and draws. */
  logoAttachmentId: z.uuid().optional(),
});

/** What the sample template says. Issuing adds the number and the date. */
export const sampleDocumentContent = z.strictObject({
  title: line(80),
  recipient: z.strictObject({ name: line(120), lines: z.array(line(120)).max(6) }),
  rows: z
    .array(z.strictObject({ description: line(500), detail: line(300).optional(), amount: printedAmount }))
    .min(1)
    .max(200),
  totals: z.array(z.strictObject({ label: line(60), amount: printedAmount, emphasis: z.boolean().optional() })).max(12),
  notes: paragraph(2000).optional(),
});

/**
 * What the quotation template says, in the words it prints (the quote page's layout): the trip, when and for whom, the
 * price lines and the total, what is due by when, the days as boxes, inclusions, exclusions and notes as points.
 */
export const quotationContent = z.strictObject({
  title: line(200),
  customer: line(200),
  /** The Pay box: the agency's UPI link (drawn as a QR, only once the agency verified it), its id and name, and what is due now; absent without a UPI id. */
  pay: z
    .strictObject({ link: line(400).optional(), upiId: line(120), name: line(120), amount: printedAmount })
    .optional(),
  /** "Fri 4 Dec 2026 · 2 adults, 1 child". */
  when: line(120).optional(),
  // The caps hold any quote that saves: 50 lines, 60 days, 12 payments, and free-text lists of up to 3000 characters.
  lines: z
    .array(z.strictObject({ description: line(500), detail: line(300).optional(), amount: printedAmount }))
    .max(50),
  /** The GST as one row, the total less the lines (so the rows add up); absent when the quote carries no tax. */
  gst: z.strictObject({ label: line(40), amount: printedAmount }).optional(),
  total: printedAmount,
  /** "incl. 5% GST"; absent when the quote carries no tax. */
  totalNote: line(60).optional(),
  /** What is due by when; `paid` once what was received covers it (absent while it is still to pay). */
  dues: z
    .array(z.strictObject({ label: line(120), by: line(40), amount: printedAmount, paid: z.literal(true).optional() }))
    .max(12),
  days: z.array(z.strictObject({ title: line(200), description: paragraph(2000).optional() })).max(60),
  inclusions: z.array(line(3000)).max(1500),
  exclusions: z.array(line(3000)).max(1500),
  notes: z.array(line(3000)).max(1500),
});

export const issueDocumentInput = z.strictObject({
  template: z.literal("sample"),
  content: sampleDocumentContent,
  branding: documentBranding,
});
export type IssueDocumentInput = z.infer<typeof issueDocumentInput>;

/** A quotation to issue: the quotation template's content and the agency's branding. */
export const issueQuotationInput = z.strictObject({
  template: z.literal("quotation"),
  content: quotationContent,
  branding: documentBranding,
});
export type IssueQuotationInput = z.infer<typeof issueQuotationInput>;

/** Any document the domain can issue. */
export const issuableDocumentInput = z.union([issueDocumentInput, issueQuotationInput]);

/** The sample template's full data: the content, plus the number and date issuing gave it. */
export const sampleDocumentData = z.strictObject({
  ...sampleDocumentContent.shape,
  number: line(40),
  issuedOn: line(40),
});

/** An issued document's content and branding exactly as issued. The PDF is rendered from this alone. */
export const quotationDocumentData = z.strictObject({
  ...quotationContent.shape,
  number: line(40),
  issuedOn: line(40),
});

export const issuedDocumentRenderInput = z.strictObject({
  data: z.union([sampleDocumentData, quotationDocumentData]),
  branding: documentBranding,
});
export type IssuedDocumentRenderInput = z.infer<typeof issuedDocumentRenderInput>;

export const issuedDocumentSummary = z.strictObject({
  id: z.uuid(),
  template: pdfTemplate,
  number: z.string(),
  title: z.string(),
  issuedAt: z.iso.datetime(),
  /** Who issued it; null when the system did. */
  issuedBy: z.uuid().nullable(),
  /** The rendered PDF's attachment; null until the worker has rendered it. */
  pdfAttachmentId: z.uuid().nullable(),
  renderedAt: z.iso.datetime().nullable(),
  /** True when the PDF can never be rendered as it stands (text its fonts can't show); the worker has stopped trying. */
  renderFailed: z.boolean(),
});
export type IssuedDocumentSummary = z.infer<typeof issuedDocumentSummary>;

/** One of the organization's issued documents. */
export const documentRefInput = z.strictObject({ documentId: z.uuid() });
export type DocumentRefInput = z.infer<typeof documentRefInput>;

/** The organization's issued documents, newest first. `cursor` is the last document of the page before. */
export const listIssuedDocumentsInput = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListIssuedDocumentsInput = z.input<typeof listIssuedDocumentsInput>;

export const issuedDocumentPage = z.object({
  documents: z.array(issuedDocumentSummary),
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: z.uuid().nullable(),
});
export type IssuedDocumentPage = z.infer<typeof issuedDocumentPage>;

/** The payload of the "document.issued" event. */
export const documentIssuedEvent = z.strictObject({ documentId: z.uuid() });
export type DocumentIssuedEvent = z.infer<typeof documentIssuedEvent>;
