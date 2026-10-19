// The spreadsheets port (spec 6.1): read a CSV or .xlsx file within limits, and write one a batch of rows at a time.

export type SpreadsheetKind = "csv" | "xlsx";

/** Why a file can't be read (spec B5). Each has its own sentence on screen. */
export const unreadableReasons = [
  "not_a_spreadsheet",
  "protected",
  "old_excel",
  "no_column_names",
  "no_rows",
  "too_many_rows",
  "too_many_columns",
  "too_large_unpacked",
] as const;
export type UnreadableReason = (typeof unreadableReasons)[number];

/** The file can't be read. The message names the reason only, never anything the file holds. */
export class SpreadsheetUnreadableError extends Error {
  readonly reason: UnreadableReason;

  constructor(reason: UnreadableReason) {
    super(`The spreadsheet can't be read: ${reason}`);
    this.name = "SpreadsheetUnreadableError";
    this.reason = reason;
  }
}

export interface ReadLimits {
  kind: SpreadsheetKind;
  /** The most data rows (the header row aside); one more refuses the file as too_many_rows. */
  maxRows: number;
  maxColumns: number;
  /** A cell is cut to one character past this, so the caller's own limit still refuses what was longer (D10). */
  maxCellLength: number;
}

/** A data row: its number in the file (the header is row 1), its cells as text, null when empty. */
export interface SheetRow {
  rowNumber: number;
  cells: readonly (string | null)[];
}

/** header: blanks named "Column C", repeats "(2)" (D13). sheetName is null for a CSV, whose sheetCount is 1. */
export interface ReadSheet {
  sheetName: string | null;
  sheetCount: number;
  header: readonly string[];
  rows: readonly SheetRow[];
}

export type ColumnKind = "text" | "phone" | "number" | "date" | "date-time";

export interface WriterColumn {
  header: string;
  kind: ColumnKind;
}

/** text, phone: string; number: number; date: "yyyy-mm-dd"; date-time: "yyyy-mm-ddTHH:MM" on the agency's clock. */
export type WrittenCell = string | number | null;

export interface SheetWriter {
  /** Adds rows after those already written; the writer keeps only its output, never the rows. */
  write(rows: readonly (readonly WrittenCell[])[]): void;
  /** Ends the file and gives its bytes. */
  finish(): Promise<Uint8Array>;
}

export interface Spreadsheets {
  read(bytes: Uint8Array, limits: ReadLimits): Promise<ReadSheet>;
  writer(options: { kind: SpreadsheetKind; sheetName: string; columns: readonly WriterColumn[] }): SheetWriter;
}
