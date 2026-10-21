// The rows of a read, each with its identity (S10, S19): the hash of its cells and which of its identical twins in the
// rows given it is. Blank rows are skipped but the others keep their numbers.
import type { SheetRead } from "@travel-crm/integrations/google-sheets";
import { type Bytes, hex, rowHash } from "./hashes.js";

export interface ReadRow {
  rowNumber: number;
  cells: readonly string[];
  hash: Bytes;
  /** 1 for the first row with these cells among the rows given, 2 for its copy, and so on. */
  occurrence: number;
}

/** Skips all-blank rows; numbers identical rows 1, 2, … within the rows given (two exact copies are two rows). */
export function numberRows(rows: SheetRead["rows"]): ReadRow[] {
  const seen = new Map<string, number>();
  const numbered: ReadRow[] = [];
  for (const row of rows) {
    if (row.cells.every((cell) => cell.trim() === "")) continue;
    const hash = rowHash(row.cells);
    const key = hex(hash);
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    numbered.push({ rowNumber: row.rowNumber, cells: row.cells, hash, occurrence });
  }
  return numbered;
}
