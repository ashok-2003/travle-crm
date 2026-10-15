// The organization's issued documents for its documents screen: newest first, a page at a time.
import {
  listIssuedDocumentsInput,
  type IssuedDocumentPage,
  type ListIssuedDocumentsInput,
} from "@travel-crm/contracts/documents";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { summaryFields, toSummary } from "./issued-document-row.js";

/**
 * One page of the transaction's organization's documents, the newest issued first (the id breaks a tie). The next page
 * starts after `cursor`, the last document of the page before; a cursor this organization can't see starts nothing.
 */
export async function listIssuedDocuments(tx: OrgTx, input: ListIssuedDocumentsInput): Promise<IssuedDocumentPage> {
  const checked = listIssuedDocumentsInput.safeParse(input);
  if (!checked.success) throw new DomainError("VALIDATION", "INVALID_PAGE", "That page of documents can't be read");
  const { cursor, limit } = checked.data;
  // One more than a page, to know whether another follows.
  const rows = await tx.issuedDocument.findMany({
    select: summaryFields,
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { documents: page.map(toSummary), nextCursor: rows.length > limit && last ? last.id : null };
}
