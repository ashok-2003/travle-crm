// The sheets' half of "same as a row already added, anywhere" (S23 step 4): the fingerprints the sheets' own ledger holds
// (a row added, merged, found a duplicate or erased, never an unresolved problem), plain or re-keyed after an erasure.
// crm unions this with imports' earlierFingerprints, so imports never calls sheets.
import { type OrgTx, sql } from "@travel-crm/db";
import { type Bytes, hex, type SheetsHashes } from "./hashes.js";

/** Each fingerprint among these the ledger holds, by hex, with when a row of it was first processed. */
export async function earlierSheetFingerprints(
  tx: OrgTx,
  fingerprints: readonly Uint8Array[],
  hashes: SheetsHashes | null,
): Promise<Map<string, Date>> {
  if (fingerprints.length === 0) return new Map();
  const keyedOf = new Map<string, Bytes>();
  for (const fingerprint of fingerprints) {
    if (hashes !== null) keyedOf.set(hex(hashes.rekey(fingerprint)), new Uint8Array(fingerprint));
  }
  const asked = [
    ...fingerprints.map((fingerprint) => Buffer.from(fingerprint)),
    ...[...keyedOf.keys()].map((keyed) => Buffer.from(keyed, "hex")),
  ];
  const rows = await tx.$queryRaw<{ fingerprint: string; addedAt: Date }[]>(sql`
    SELECT encode(fingerprint, 'hex') AS fingerprint, min(COALESCE(processed_at, first_seen_at)) AS "addedAt"
    FROM sheet_row
    WHERE fingerprint = ANY(${asked}::bytea[]) AND status IN ('added', 'merged', 'duplicate', 'erased')
    GROUP BY fingerprint`);
  const found = new Map<string, Date>();
  for (const row of rows) {
    const plain = keyedOf.get(row.fingerprint);
    const key = plain === undefined ? row.fingerprint : hex(plain);
    const earlier = found.get(key);
    if (earlier === undefined || row.addedAt < earlier) found.set(key, row.addedAt);
  }
  return found;
}

/**
 * Which of these fingerprints (plain, as hex) a row of this connection that was there at connect holds. They are stored
 * keyed, so the question is asked keyed; without the key nothing is known.
 */
export async function baselineSheetFingerprints(
  tx: OrgTx,
  connectionId: string,
  fingerprints: readonly Uint8Array[],
  hashes: SheetsHashes | null,
): Promise<Set<string>> {
  if (fingerprints.length === 0 || hashes === null) return new Set();
  const plainOf = new Map(fingerprints.map((fingerprint) => [hex(hashes.rekey(fingerprint)), hex(fingerprint)]));
  const rows = await tx.$queryRaw<{ fingerprint: string }[]>(sql`
    SELECT DISTINCT encode(fingerprint, 'hex') AS fingerprint
    FROM sheet_row
    WHERE connection_id = ${connectionId}::uuid AND status = 'before_connect'
      AND fingerprint = ANY(${[...plainOf.keys()].map((keyed) => Buffer.from(keyed, "hex"))}::bytea[])`);
  return new Set(rows.flatMap((row) => plainOf.get(row.fingerprint) ?? []));
}
