// The ledger of a connection's rows (S9, S19, S31): which rows of a read are known, and which problems and waiting rows
// have left the sheet. A row is looked up by its hash and occurrence, plain or re-keyed (an erased customer's row is
// known by the keyed one), a thousand rows to a statement.
import type { OrgTx } from "@travel-crm/db";
import type { SheetRowStatus } from "@travel-crm/contracts/sheets";
import { type Bytes, hex, type SheetsHashes } from "./hashes.js";
import type { ReadRow } from "./numbered-rows.js";

export interface LedgerEntry {
  id: string;
  status: SheetRowStatus;
  rowNumber: number;
}

const rowsPerLookup = 1_000;

export const ledgerKey = (hash: Uint8Array, occurrence: number): string => `${hex(hash)}:${String(occurrence)}`;

/** S9: before_connect, added, merged, duplicate and erased are known; pending and not_added are read again. */
export function isKnown(entry: LedgerEntry | undefined): boolean {
  return entry !== undefined && entry.status !== "pending" && entry.status !== "not_added";
}

interface StoredLedgerRow {
  id: string;
  rawHash: Uint8Array;
  occurrence: number;
  status: string;
  rowNumber: number;
}

/**
 * The ledger entries of these rows, by `${hex}:${occurrence}`. The re-keyed hash is tried too, and finds a row of an
 * erased customer under the plain hash's key.
 */
export async function lookUpLedger(
  tx: OrgTx,
  connectionId: string,
  rows: readonly ReadRow[],
  hashes: SheetsHashes | null,
): Promise<Map<string, LedgerEntry>> {
  const found = new Map<string, LedgerEntry>();
  for (let start = 0; start < rows.length; start += rowsPerLookup) {
    const chunk = rows.slice(start, start + rowsPerLookup);
    const keyedOf = new Map<string, Bytes>();
    const asked = new Map<string, Bytes>();
    for (const row of chunk) {
      asked.set(hex(row.hash), row.hash);
      if (hashes !== null) {
        const keyed = hashes.rekey(row.hash);
        keyedOf.set(hex(keyed), row.hash);
        asked.set(hex(keyed), keyed);
      }
    }
    const stored = await tx.sheetRow.findMany({
      where: { connectionId, rawHash: { in: [...asked.values()] } },
      select: { id: true, rawHash: true, occurrence: true, status: true, rowNumber: true },
    });
    for (const row of stored satisfies StoredLedgerRow[]) {
      const asHex = hex(row.rawHash);
      const plain = keyedOf.get(asHex);
      found.set(ledgerKey(plain ?? row.rawHash, row.occurrence), {
        id: row.id,
        status: row.status as SheetRowStatus,
        rowNumber: row.rowNumber,
      });
    }
  }
  return found;
}

/**
 * S31, S9: the unresolved problems whose hash the read no longer holds are marked resolved, and the waiting rows
 * dropped, at the read that covers their place (a full read always does; a window from `fromRow` covers the rows
 * from there on). A row outside the window is left alone.
 */
export async function clearVanishedRows(
  tx: OrgTx,
  connectionId: string,
  input: { read: readonly ReadRow[]; fromRow: number; full: boolean },
  now: Date,
): Promise<{ resolved: number; dropped: number }> {
  const present = new Set(input.read.map((row) => ledgerKey(row.hash, row.occurrence)));
  const covered = input.full ? 0 : input.fromRow;
  const candidates = await tx.sheetRow.findMany({
    where: {
      connectionId,
      rowNumber: { gte: covered },
      OR: [{ status: "not_added", resolvedAt: null }, { status: "pending" }],
    },
    select: { id: true, rawHash: true, occurrence: true, status: true },
  });
  const gone = candidates.filter((row) => !present.has(ledgerKey(row.rawHash, row.occurrence)));
  const resolved = gone.filter((row) => row.status === "not_added").map((row) => row.id);
  const dropped = gone.filter((row) => row.status === "pending").map((row) => row.id);
  if (resolved.length > 0) {
    await tx.sheetRow.updateMany({ where: { id: { in: resolved } }, data: { resolvedAt: now } });
  }
  if (dropped.length > 0) await tx.sheetRow.deleteMany({ where: { id: { in: dropped } } });
  return { resolved: resolved.length, dropped: dropped.length };
}

/** The smallest row number of a row still waiting, so the window never leaves a half-typed row behind (S11). */
export async function firstPendingRow(tx: OrgTx, connectionId: string): Promise<number | null> {
  const row = await tx.sheetRow.findFirst({
    where: { connectionId, status: "pending" },
    orderBy: { rowNumber: "asc" },
    select: { rowNumber: true },
  });
  return row?.rowNumber ?? null;
}
