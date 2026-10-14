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

/** The templates the renderer knows. The Foundation ships one; quotes and invoices add theirs. */
export const pdfTemplate = z.enum(["sample"]);

/** The organization's own branding on a document. Its logo joins when plan 4 stores branding settings. */
export const documentBranding = z.strictObject({
  organizationName: line(120),
  accentColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1a2b3c")
    .optional(),
  terms: paragraph(2000).optional(),
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

export const issueDocumentInput = z.strictObject({
  template: pdfTemplate,
  content: sampleDocumentContent,
  branding: documentBranding,
});
export type IssueDocumentInput = z.infer<typeof issueDocumentInput>;

/** The sample template's full data: the content, plus the number and date issuing gave it. */
export const sampleDocumentData = z.strictObject({
  ...sampleDocumentContent.shape,
  number: line(40),
  issuedOn: line(40),
});

/** An issued document's content and branding exactly as issued. The PDF is rendered from this alone. */
export const issuedDocumentRenderInput = z.strictObject({ data: sampleDocumentData, branding: documentBranding });
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
});
export type IssuedDocumentSummary = z.infer<typeof issuedDocumentSummary>;

/** The payload of the "document.issued" event. */
export const documentIssuedEvent = z.strictObject({ documentId: z.uuid() });
