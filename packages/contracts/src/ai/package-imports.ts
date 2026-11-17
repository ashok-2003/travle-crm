// New package from PDFs: each brochure uploaded on New package is read alone and every trip in it becomes a group
// package at once, its gaps (what the AI still needs to sell it) shown to fill in. Manual New package stays as it was.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { sellGaps } from "../quotes/packages.js";

/** PDFs one upload may hold. */
export const MAX_PDF_IMPORTS = 10;

/** Where an uploaded PDF stands: the worker reads its words, then the trips in it can be made into packages. */
export const pdfDocumentStatuses = ["reading", "ready", "failed"] as const;

export const pdfDocumentStatesInput = z.strictObject({
  knowledgeIds: z.array(recordId).min(1).max(MAX_PDF_IMPORTS),
});
export type PdfDocumentStatesInput = z.infer<typeof pdfDocumentStatesInput>;

export const pdfDocumentStates = z.array(z.object({ knowledgeId: recordId, status: z.enum(pdfDocumentStatuses) }));
export type PdfDocumentStates = z.infer<typeof pdfDocumentStates>;

export const importPdfInput = z.strictObject({ knowledgeId: recordId });
export type ImportPdfInput = z.infer<typeof importPdfInput>;

/**
 * What one PDF became: each package made, with what the AI still needs to sell it, and each trip found but not made
 * (its name and the refusal's code). `trips` counts every trip found.
 */
export const importedPdf = z.object({
  trips: z.int().min(0),
  packages: z.array(z.object({ id: recordId, name: z.string(), gaps: z.array(z.enum(sellGaps)) })),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});
export type ImportedPdf = z.infer<typeof importedPdf>;
