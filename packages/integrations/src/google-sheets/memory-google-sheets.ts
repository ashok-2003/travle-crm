// An in-memory GoogleSheets for the domain's, the api's and the journeys' tests: sheets as objects that can be shared,
// sorted, edited and deleted, that answer as Google does (an unshared one is refused), and that fail on demand.
import {
  type GoogleAccount,
  type GoogleSheets,
  GoogleSheetsError,
  type GoogleSheetsErrorReason,
  type ReadRowsOptions,
  type SheetDescription,
  type SheetRead,
  type SheetTab,
} from "./google-sheets.js";
import { shapeRows } from "./shape-rows.js";

interface MemoryTab {
  gid: string;
  title: string;
  /** rows[0] is the header; rows[n - 1] is the sheet's row n. */
  rows: string[][];
}

interface MemorySpreadsheet {
  id: string;
  title: string;
  locale: string;
  timeZone: string;
  kind: "sheet" | "excel";
  tabs: MemoryTab[];
  sharedWith: Set<string>;
}

export interface MemoryGoogleSheets extends GoogleSheets {
  addSpreadsheet(sheet: {
    id: string;
    title: string;
    locale?: string;
    timeZone?: string;
    kind?: "sheet" | "excel";
    tabs: { gid: string; title: string; rows: string[][] }[];
  }): void;
  share(spreadsheetId: string, accountEmail: string): void;
  unshare(spreadsheetId: string, accountEmail: string): void;
  deleteSpreadsheet(spreadsheetId: string): void;
  append(spreadsheetId: string, tabTitle: string, row: string[]): void;
  insertAt(spreadsheetId: string, tabTitle: string, rowNumber: number, row: string[]): void;
  deleteAt(spreadsheetId: string, tabTitle: string, rowNumber: number): void;
  /** Sorts the data rows; the header stays in row 1. */
  sort(spreadsheetId: string, tabTitle: string, compare: (a: string[], b: string[]) => number): void;
  editCell(spreadsheetId: string, tabTitle: string, rowNumber: number, columnIndex: number, value: string): void;
  rename(spreadsheetId: string, title: string): void;
  renameTab(spreadsheetId: string, gid: string, title: string): void;
  /** Makes the next `times` calls (default 1), of one account if named, fail with this reason. */
  failNext(
    reason: GoogleSheetsErrorReason,
    options?: { retryAfterSeconds?: number; times?: number; accountIndex?: number },
  ): void;
  readonly calls: { total: number; describes: number; reads: number; byAccount: Readonly<Record<number, number>> };
}

/** Plays an async call: a thrown error becomes a rejection, as a real call's would be. */
function settled<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("The memory Google failed"));
  }
}

const sampleRowCount = 3;
const defaultAccountEmail = "sheets-1@travel-crm-test.iam.gserviceaccount.com";

function lastRowWithValue(rows: readonly (readonly string[])[], from: number, to: number): number {
  for (let number = to; number >= from; number -= 1) {
    if (rows[number - 1]?.some((cell) => cell.trim() !== "")) return number;
  }
  return 0;
}

export function createMemoryGoogleSheets(options: { accountEmails?: readonly string[] } = {}): MemoryGoogleSheets {
  const emails = options.accountEmails ?? [defaultAccountEmail];
  const accounts: GoogleAccount[] = emails.map((email, index) => ({ index, email }));
  const spreadsheets = new Map<string, MemorySpreadsheet>();
  const failures: { reason: GoogleSheetsErrorReason; retryAfterSeconds: number | null; accountIndex: number | null }[] =
    [];
  const calls = { total: 0, describes: 0, reads: 0, byAccount: {} as Record<number, number> };

  const spreadsheetOf = (id: string): MemorySpreadsheet => {
    const sheet = spreadsheets.get(id);
    if (sheet === undefined) throw new Error("No such spreadsheet in the memory Google");
    return sheet;
  };
  const tabOf = (id: string, title: string): MemoryTab => {
    const tab = spreadsheetOf(id).tabs.find((candidate) => candidate.title === title);
    if (tab === undefined) throw new Error("No such tab in the memory Google");
    return tab;
  };

  /** Counts the call, then plays Google: a planned failure, a missing or unshared sheet, an Excel file. */
  function open(kind: "describe" | "read", accountIndex: number, spreadsheetId: string): MemorySpreadsheet {
    const account = accounts[accountIndex];
    if (account === undefined) throw new RangeError("No such service account");
    calls.total += 1;
    calls[kind === "describe" ? "describes" : "reads"] += 1;
    calls.byAccount[accountIndex] = (calls.byAccount[accountIndex] ?? 0) + 1;
    const planned = failures.findIndex((f) => f.accountIndex === null || f.accountIndex === accountIndex);
    if (planned !== -1) {
      const [failure] = failures.splice(planned, 1);
      if (failure !== undefined) throw new GoogleSheetsError(failure.reason, failure.retryAfterSeconds);
    }
    const sheet = spreadsheets.get(spreadsheetId);
    if (sheet === undefined) throw new GoogleSheetsError("not_found");
    if (!sheet.sharedWith.has(account.email)) throw new GoogleSheetsError("not_shared");
    if (sheet.kind === "excel") throw new GoogleSheetsError("not_a_sheet");
    return sheet;
  }

  return {
    accounts: () => accounts,

    describe: (accountIndex, spreadsheetId, describeOptions = {}) =>
      settled((): SheetDescription => {
        const sheet = open("describe", accountIndex, spreadsheetId);
        const tabs: SheetTab[] = sheet.tabs.map((tab) => ({
          gid: tab.gid,
          title: tab.title,
          isGrid: true,
          rowCount: Math.max(tab.rows.length, 1000),
        }));
        const chosen = sheet.tabs.find((tab) => tab.gid === describeOptions.tabGid) ?? sheet.tabs[0];
        const limits = { maxColumns: 50, maxCellLength: 4_000 };
        const shaped = chosen === undefined ? [] : shapeRows(chosen.rows.slice(0, 1 + sampleRowCount), limits);
        return {
          title: sheet.title,
          locale: sheet.locale,
          timeZone: sheet.timeZone,
          tabs,
          chosenTab: tabs.find((tab) => tab.gid === chosen?.gid) ?? null,
          header: shaped[0] ?? [],
          sampleRows: shaped.slice(1),
        };
      }),

    readRows: (accountIndex, spreadsheetId, readOptions: ReadRowsOptions) =>
      settled((): SheetRead => {
        const sheet = open("read", accountIndex, spreadsheetId);
        const tab = sheet.tabs.find((candidate) => candidate.title === readOptions.tabTitle);
        if (tab === undefined) throw new GoogleSheetsError("tab_missing");
        const limits = { maxColumns: readOptions.maxColumns, maxCellLength: readOptions.maxCellLength };
        const fromRow = Math.max(2, readOptions.fromRow);
        const lastWanted = fromRow + readOptions.maxRows - 1;
        const available = lastRowWithValue(tab.rows, fromRow, tab.rows.length);
        const last = Math.min(available, lastWanted);
        const wanted = tab.rows.slice(fromRow - 1, last);
        const fromColumn = readOptions.fromColumn ?? 0;
        const shaped = shapeRows(
          [tab.rows[0] ?? [], ...wanted].map((cells) => cells.slice(fromColumn)),
          limits,
        );
        const header = shaped[0] ?? [];
        const rows = shaped.slice(1).map((cells, index) => ({ rowNumber: fromRow + index, cells }));
        return {
          header,
          rows,
          lastRow: Math.max(last, fromRow - 1),
          truncated: available > lastWanted,
        };
      }),

    addSpreadsheet(sheet) {
      spreadsheets.set(sheet.id, {
        id: sheet.id,
        title: sheet.title,
        locale: sheet.locale ?? "en_IN",
        timeZone: sheet.timeZone ?? "Asia/Kolkata",
        kind: sheet.kind ?? "sheet",
        tabs: sheet.tabs.map((tab) => ({ gid: tab.gid, title: tab.title, rows: tab.rows })),
        sharedWith: new Set(),
      });
    },
    share: (spreadsheetId, accountEmail) => {
      spreadsheetOf(spreadsheetId).sharedWith.add(accountEmail);
    },
    unshare: (spreadsheetId, accountEmail) => {
      spreadsheetOf(spreadsheetId).sharedWith.delete(accountEmail);
    },
    deleteSpreadsheet: (spreadsheetId) => {
      spreadsheets.delete(spreadsheetId);
    },
    append: (spreadsheetId, tabTitle, row) => {
      tabOf(spreadsheetId, tabTitle).rows.push(row);
    },
    insertAt: (spreadsheetId, tabTitle, rowNumber, row) => {
      tabOf(spreadsheetId, tabTitle).rows.splice(rowNumber - 1, 0, row);
    },
    deleteAt: (spreadsheetId, tabTitle, rowNumber) => {
      tabOf(spreadsheetId, tabTitle).rows.splice(rowNumber - 1, 1);
    },
    sort: (spreadsheetId, tabTitle, compare) => {
      const tab = tabOf(spreadsheetId, tabTitle);
      const [header, ...data] = tab.rows;
      tab.rows = [header ?? [], ...data.sort(compare)];
    },
    editCell: (spreadsheetId, tabTitle, rowNumber, columnIndex, value) => {
      const row = tabOf(spreadsheetId, tabTitle).rows[rowNumber - 1];
      if (row === undefined) throw new Error("No such row in the memory Google");
      while (row.length <= columnIndex) row.push("");
      row[columnIndex] = value;
    },
    rename: (spreadsheetId, title) => {
      spreadsheetOf(spreadsheetId).title = title;
    },
    renameTab: (spreadsheetId, gid, title) => {
      const tab = spreadsheetOf(spreadsheetId).tabs.find((candidate) => candidate.gid === gid);
      if (tab === undefined) throw new Error("No such tab in the memory Google");
      tab.title = title;
    },
    failNext: (reason, failOptions = {}) => {
      for (let time = 0; time < (failOptions.times ?? 1); time += 1) {
        failures.push({
          reason,
          retryAfterSeconds: failOptions.retryAfterSeconds ?? null,
          accountIndex: failOptions.accountIndex ?? null,
        });
      }
    },
    calls,
  };
}
