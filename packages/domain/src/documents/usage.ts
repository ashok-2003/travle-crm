// How many documents an organization issued: a usage counter for the platform dashboard (spec 7.4).
import type { OrgTx } from "@travel-crm/db";
import { SAMPLE_DOCUMENT_PREFIX } from "@travel-crm/contracts/documents";

/**
 * Documents the transaction's organization issued since `since`, its branding's samples left out (previews, not use);
 * the dashboard counts each organization inside asOrganization. Row-level security is what limits it to one
 * organization, so it refuses to run as the platform role, which sees them all.
 */
export async function documentsIssuedSince(tx: OrgTx, since: Date): Promise<number> {
  const [session] = await tx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
  if (session?.role !== "app_runtime") {
    throw new RangeError("Count an organization's documents inside it (forOrg or asOrganization)");
  }
  return tx.issuedDocument.count({
    where: { issuedAt: { gte: since }, NOT: { number: { startsWith: `${SAMPLE_DOCUMENT_PREFIX}-` } } },
  });
}
