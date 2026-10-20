// The ledger of a connection's rows (S9, S19, S31): which rows of a read are known, and which problems and waiting rows
// have left the sheet. A row is looked up by its hash and occurrence, plain or re-keyed (an erased customer's row is
// known by the keyed one), a thousand rows to a statement.
import { type OrgTx, sql } from "@travel-crm/db";
import type { SheetRowStatus } from "@travel-crm/contracts/sheets";
import { type Bytes, hex, type SheetsHashes } from "./hashes.js";
import type { ReadRow } from "./numbered-rows.js";

export interface LedgerEntry {
  id: string;
  status: SheetRowStatus;
  rowNumber: number;
  /** A problem hidden by hand (S31): a scheduled check leaves it alone, Sync now plans it again (M7). */
  hidden: boolean;
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
  resolvedAt: Date | null;
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
      select: { id: true, rawHash: true, occurrence: true, status: true, rowNumber: true, resolvedAt: true },
    });
    for (const row of stored satisfies StoredLedgerRow[]) {
      const asHex = hex(row.rawHash);
      const plain = keyedOf.get(asHex);
      found.set(ledgerKey(plain ?? row.rawHash, row.occurrence), {
        id: row.id,
        status: row.status as SheetRowStatus,
        rowNumber: row.rowNumber,
        hidden: row.status === "not_added" && row.resolvedAt !== null,
      });
    }
  }
  return found;
}

/**
 * S31, S9: the problems (hidden or not) whose hash the read no longer holds, and the waiting rows, are deleted, at a full
 * read only. A window can not tell what left the sheet: rows sorted or inserted above leave the stored numbers stale (M2),
 * so a window read clears nothing and the next full read does.
 */
export async function clearVanishedRows(
  tx: OrgTx,
  connectionId: string,
  input: { read: readonly ReadRow[]; fromRow: number; full: boolean },
): Promise<{ resolved: number; dropped: number }> {
  if (!input.full) return { resolved: 0, dropped: 0 };
  const present = new Set(input.read.map((row) => ledgerKey(row.hash, row.occurrence)));
  const candidates = await tx.sheetRow.findMany({
    where: {
      connectionId,
      // A problem hidden by hand stays until its row leaves the sheet (SD2); then it goes with the rest.
      OR: [{ status: "not_added" }, { status: "pending" }],
    },
    select: { id: true, rawHash: true, occurrence: true, status: true },
  });
  const gone = candidates.filter((row) => !present.has(ledgerKey(row.rawHash, row.occurrence)));
  const resolved = gone.filter((row) => row.status === "not_added").map((row) => row.id);
  const dropped = gone.filter((row) => row.status === "pending").map((row) => row.id);
  // A problem whose row is gone (fixed, edited or deleted) leaves the list, hidden or not; a waiting row is dropped too.
  if (resolved.length + dropped.length > 0) {
    await tx.sheetRow.deleteMany({ where: { id: { in: [...resolved, ...dropped] } } });
  }
  return { resolved: resolved.length, dropped: dropped.length };
}

/**
 * M2: at a full read, where the numbering is true, the known rows are given the numbers they have now, so a sort or an
 * insert leaves them current and a window's check of rows above it (`repeatsAboveWindow`) does not force a full read each time.
 */
export async function refreshRowNumbers(
  tx: OrgTx,
  connectionId: string,
  rows: readonly ReadRow[],
  ledger: ReadonlyMap<string, LedgerEntry>,
): Promise<void> {
  const moved = rows.flatMap((row) => {
    const entry = ledger.get(ledgerKey(row.hash, row.occurrence));
    return entry !== undefined && entry.rowNumber !== row.rowNumber ? [{ id: entry.id, rowNumber: row.rowNumber }] : [];
  });
  for (let start = 0; start < moved.length; start += rowsPerLookup) {
    const chunk = moved.slice(start, start + rowsPerLookup);
    await tx.$executeRaw(sql`
      UPDATE sheet_row SET row_number = moved.row_number
      FROM unnest(${chunk.map(({ id }) => id)}::uuid[], ${chunk.map(({ rowNumber }) => rowNumber)}::int[])
        AS moved(id, row_number)
      WHERE sheet_row.id = moved.id AND sheet_row.connection_id = ${connectionId}::uuid`);
  }
}

/**
 * Whether any row of this windowed read has cells the ledger already holds at a row above the window (SD12). Identical
 * rows are numbered 1, 2, … within the rows read, so a window that holds a later copy would number it 1 and take it for
 * the earlier one: the whole tab is read instead, where the numbering is true.
 */
export async function repeatsAboveWindow(
  tx: OrgTx,
  connectionId: string,
  rows: readonly ReadRow[],
  fromRow: number,
): Promise<boolean> {
  if (fromRow <= 2) return false;
  const hashes = [...new Map(rows.map((row) => [hex(row.hash), row.hash])).values()];
  for (let start = 0; start < hashes.length; start += rowsPerLookup) {
    const found = await tx.sheetRow.count({
      where: { connectionId, rawHash: { in: hashes.slice(start, start + rowsPerLookup) }, rowNumber: { lt: fromRow } },
    });
    if (found > 0) return true;
  }
  return false;
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
