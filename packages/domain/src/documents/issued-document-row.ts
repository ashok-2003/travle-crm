// How an issued document row reads as the API's summary, and finding one in the organization.
import { issuedDocumentSummary, type IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

export const summaryFields = {
  id: true,
  template: true,
  number: true,
  title: true,
  issuedAt: true,
  issuedBy: true,
  pdfAttachmentId: true,
  renderedAt: true,
} as const;

interface SummaryRow {
  id: string;
  template: string;
  number: string;
  title: string;
  issuedAt: Date;
  issuedBy: string | null;
  pdfAttachmentId: string | null;
  renderedAt: Date | null;
}

export function toSummary(row: SummaryRow): IssuedDocumentSummary {
  // Parsed, so a template the renderer doesn't know fails here rather than in a customer's hands.
  return issuedDocumentSummary.parse({
    ...row,
    issuedAt: row.issuedAt.toISOString(),
    renderedAt: row.renderedAt?.toISOString() ?? null,
  });
}

/**
 * An issued document of the transaction's organization, with its PDF's attachment id (null until rendered).
 * Another organization's document is "not found": row-level security hides it.
 */
export async function getIssuedDocument(tx: OrgTx, input: { documentId: string }): Promise<IssuedDocumentSummary> {
  const row = await tx.issuedDocument.findUnique({ where: { id: input.documentId }, select: summaryFields });
  if (!row) throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_FOUND", "No such document");
  return toSummary(row);
}
