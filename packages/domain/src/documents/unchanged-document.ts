// Whether a document issued before still says what issuing it now would: then the caller gives that one again, and only a
// change to what it prints (a payment, the UPI id, the terms) uses the next number.
import {
  issuableDocumentInput,
  type IssueDocumentInput,
  type IssueQuotationInput,
} from "@travel-crm/contracts/documents";
import type { OrgTx } from "@travel-crm/db";

/** The value with every object's keys in one order, so two copies compare equal however Postgres stored the keys. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => [key, canonical(inner)]),
  );
}

/**
 * The document issued before, when its frozen content and branding are what `input` would freeze now (its number and
 * date aside); null when anything differs, so the caller issues anew.
 */
export async function unchangedDocument(
  tx: OrgTx,
  documentId: string,
  input: IssueDocumentInput | IssueQuotationInput,
): Promise<{ documentId: string; number: string } | null> {
  // The parsed (trimmed) value, as issuing freezes it.
  const checked = issuableDocumentInput.safeParse(input);
  if (!checked.success) return null;
  const kept = await tx.issuedDocument.findUniqueOrThrow({
    where: { id: documentId },
    select: { number: true, template: true, renderInput: true },
  });
  const stored = kept.renderInput as { data?: { issuedOn?: unknown } } | null;
  const now = {
    data: { ...checked.data.content, number: kept.number, issuedOn: stored?.data?.issuedOn },
    branding: checked.data.branding,
  };
  const same =
    kept.template === checked.data.template && JSON.stringify(canonical(now)) === JSON.stringify(canonical(stored));
  return same ? { documentId, number: kept.number } : null;
}
