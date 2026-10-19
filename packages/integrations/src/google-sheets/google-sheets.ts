// The Google Sheets port (spec 6.1, ADR 0031): describe a sheet and read its rows. It has no method that writes (S1).

/** The only scope the service account ever asks for (S1). */
export const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** The port's methods, listed so a test can prove none writes (S1). */
export const googleSheetsMethods = ["accounts", "describe", "readRows"] as const;

export interface GoogleAccount {
  index: number;
  email: string;
}

/** rowCount is the tab's grid size, not how many rows hold data. */
export interface SheetTab {
  gid: string;
  title: string;
  isGrid: boolean;
  rowCount: number;
}

export interface SheetDescription {
  title: string;
  locale: string;
  timeZone: string;
  tabs: readonly SheetTab[];
  /** The tab with `tabGid`, else the first grid tab; null when the sheet has no grid tab. */
  chosenTab: SheetTab | null;
  /** The chosen tab's row 1, as shown. */
  header: readonly string[];
  /** Rows 2 to 4 of the chosen tab, each as wide as the header. */
  sampleRows: readonly (readonly string[])[];
}

export interface ReadRowsOptions {
  tabTitle: string;
  /** The first row to give, at least 2 (row 1 is the header and always comes back). */
  fromRow: number;
  /** At most this many rows from `fromRow`; `truncated` says the tab held more. */
  maxRows: number;
  maxColumns: number;
  maxCellLength: number;
}

/**
 * header: row 1. rows: from `fromRow`, each padded to the header's width, "" for an empty cell, a row of only blanks
 * included so that row numbers stay true. lastRow: the last row with a value among those read.
 */
export interface SheetRead {
  header: readonly string[];
  rows: readonly { rowNumber: number; cells: readonly string[] }[];
  lastRow: number;
  truncated: boolean;
}

export const googleSheetsErrorReasons = [
  "not_shared",
  "not_found",
  "not_a_sheet",
  "tab_missing",
  "rate_limited",
  "unavailable",
  "too_large",
] as const;
export type GoogleSheetsErrorReason = (typeof googleSheetsErrorReasons)[number];

/** Google refused or failed. The message is the reason only: never a sheet's content, title or a token. */
export class GoogleSheetsError extends Error {
  readonly reason: GoogleSheetsErrorReason;
  readonly retryAfterSeconds: number | null;

  constructor(reason: GoogleSheetsErrorReason, retryAfterSeconds: number | null = null) {
    super(`Google Sheets: ${reason}`);
    this.name = "GoogleSheetsError";
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface GoogleSheets {
  accounts(): readonly GoogleAccount[];
  describe(accountIndex: number, spreadsheetId: string, options?: { tabGid?: string }): Promise<SheetDescription>;
  readRows(accountIndex: number, spreadsheetId: string, options: ReadRowsOptions): Promise<SheetRead>;
}
