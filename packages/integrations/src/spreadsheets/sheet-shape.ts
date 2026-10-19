// The rows both readers find, shaped alike (B3, B5, D13): the first non-empty row names the columns, blanks by their
// letter and repeats with "(2)"; empty rows are skipped but keep their numbers; the limits refuse what is too big.
import { type ReadLimits, type ReadSheet, type SheetRow, SpreadsheetUnreadableError } from "./spreadsheets.js";

/** A row as a reader found it: its number in the file and its cells as text. */
export interface FoundRow {
  rowNumber: number;
  cells: readonly (string | null)[];
}

/** "A" for the first column, "Z" for the 26th, "AA" for the 27th: the letters Excel shows above it. */
export function columnLetters(index: number): string {
  let letters = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

/** How many columns the row uses: up to its last non-empty cell. */
function widthOf(cells: readonly (string | null)[]): number {
  for (let index = cells.length - 1; index >= 0; index -= 1) if (cells[index] !== null) return index + 1;
  return 0;
}

function nameColumns(cells: readonly (string | null)[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, index) => {
    const name = cells[index] ?? `Column ${columnLetters(index)}`;
    const times = (seen.get(name.toLowerCase()) ?? 0) + 1;
    seen.set(name.toLowerCase(), times);
    return times === 1 ? name : `${name} (${String(times)})`;
  });
}

/**
 * Collects rows one at a time, refusing a row past the limit as soon as it comes (B4: "stops one row past"), then
 * shapes the sheet. A reader calls `add` for every row in order and `finish` at the end.
 */
export function sheetShaper(limits: ReadLimits, sheet: { sheetName: string | null; sheetCount: number }) {
  let header: FoundRow | null = null;
  const rows: FoundRow[] = [];
  let width = 0;
  return {
    add(row: FoundRow): void {
      const rowWidth = widthOf(row.cells);
      if (rowWidth === 0) return;
      if (rowWidth > limits.maxColumns) throw new SpreadsheetUnreadableError("too_many_columns");
      width = Math.max(width, rowWidth);
      if (header === null) header = row;
      else if (rows.push(row) > limits.maxRows) throw new SpreadsheetUnreadableError("too_many_rows");
    },
    finish(): ReadSheet {
      if (header === null) throw new SpreadsheetUnreadableError("no_column_names");
      if (rows.length === 0) throw new SpreadsheetUnreadableError("no_rows");
      const padded = (cells: readonly (string | null)[]) =>
        Array.from({ length: width }, (_, index) => cells[index] ?? null);
      return {
        ...sheet,
        header: nameColumns(header.cells, width),
        rows: rows.map((row): SheetRow => ({ rowNumber: row.rowNumber, cells: padded(row.cells) })),
      };
    },
  };
}
