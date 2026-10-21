// Rows already imported (B33, D9): a row's fingerprint is the SHA-256 of its kind and matched values as read, kept on
// the rows the add saved; another import's rows are found by it with = ANY, which row-level security lets use the
// partial index import_row_fingerprint.
import { createHash } from "node:crypto";
import type { ImportKind } from "@travel-crm/contracts/imports";
import { type OrgTx, sql, type Sql } from "@travel-crm/db";

export function rowFingerprint(kind: ImportKind, values: readonly (string | null)[]): Uint8Array {
  return Uint8Array.from(
    createHash("sha256")
      .update(JSON.stringify([kind, ...values]))
      .digest(),
  );
}

/** A fingerprint as earlierFingerprints keys it. */
export const fingerprintHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/**
 * The fingerprints among these that another import of the agency's kind added, each with the earliest time its import
 * added it. The kind is inside every fingerprint, so a staff row never matches a lead's.
 */
export function earlierFingerprintsQuery(
  kind: ImportKind,
  fingerprints: readonly Uint8Array[],
  exceptImportId: string,
): Sql {
  return sql`
    SELECT encode(r.fingerprint, 'hex') AS fingerprint,
      min(COALESCE(b.finished_at, b.add_requested_at, b.created_at)) AS "addedAt"
    FROM import_row r
    JOIN import_batch b ON b.organization_id = r.organization_id AND b.id = r.batch_id
    WHERE r.fingerprint = ANY(${fingerprints.map((fingerprint) => Buffer.from(fingerprint))}::bytea[])
      AND r.batch_id <> ${exceptImportId}::uuid AND b.kind = ${kind}
    GROUP BY r.fingerprint`;
}

/** The fingerprints another import added, by their hex, with when that was. */
export async function earlierFingerprints(
  tx: OrgTx,
  kind: ImportKind,
  fingerprints: readonly Uint8Array[],
  exceptImportId: string,
): Promise<Map<string, Date>> {
  if (fingerprints.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ fingerprint: string; addedAt: Date }[]>(
    earlierFingerprintsQuery(kind, fingerprints, exceptImportId),
  );
  return new Map(rows.map((row) => [row.fingerprint, row.addedAt]));
}
