// Reading a connected sheet's tab from a row on, as a check and the baseline do (S17, S40): one read, bounded by the
// limits, finding the tab by its gid when its title was changed since.
import { type GoogleSheets, GoogleSheetsError, type SheetRead } from "@travel-crm/integrations/google-sheets";
import type { SheetConnectionRow } from "./connection-row.js";
import { maxCellLength, maxSheetColumns, maxSheetRows } from "./limits.js";

export interface TabRead {
  read: SheetRead;
  /** The tab's title as Google has it now: the cache is refreshed when it differs. */
  tabTitle: string;
}

/** The most data rows to ask for from `fromRow`, so nothing past the sheet's last readable row is fetched. */
export const rowsFrom = (fromRow: number): number => Math.max(1, maxSheetRows + 2 - fromRow);

/**
 * The header and the rows from `fromRow` on. A tab read by a title that is gone is looked for by its gid with one
 * describe (S40): found, it is read by its new title; a gid that is gone throws tab_missing.
 */
export async function readSheetTab(
  google: GoogleSheets,
  sheet: Pick<SheetConnectionRow, "spreadsheetId" | "serviceAccountIndex" | "tabGid" | "tabTitle">,
  fromRow: number,
): Promise<TabRead> {
  const options = { fromRow, maxRows: rowsFrom(fromRow), maxColumns: maxSheetColumns, maxCellLength };
  try {
    const read = await google.readRows(sheet.serviceAccountIndex, sheet.spreadsheetId, {
      ...options,
      tabTitle: sheet.tabTitle,
    });
    return { read, tabTitle: sheet.tabTitle };
  } catch (error) {
    if (!(error instanceof GoogleSheetsError) || error.reason !== "tab_missing") throw error;
  }
  const description = await google.describe(sheet.serviceAccountIndex, sheet.spreadsheetId, { tabGid: sheet.tabGid });
  const tab = description.chosenTab;
  if (tab?.gid !== sheet.tabGid) throw new GoogleSheetsError("tab_missing");
  const read = await google.readRows(sheet.serviceAccountIndex, sheet.spreadsheetId, {
    ...options,
    tabTitle: tab.title,
  });
  return { read, tabTitle: tab.title };
}
