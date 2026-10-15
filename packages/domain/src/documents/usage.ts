// How many documents an organization issued: a usage counter for the platform dashboard (spec 7.4).
import type { OrgTx } from "@travel-crm/db";

/** Documents the transaction's organization issued since `since`. */
export async function documentsIssuedSince(tx: OrgTx, since: Date): Promise<number> {
  return tx.issuedDocument.count({ where: { issuedAt: { gte: since } } });
}
