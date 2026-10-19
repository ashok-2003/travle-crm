// Public API of @travel-crm/integrations/google-sheets: the read-only Google Sheets port and its adapters (spec 6.1).
export {
  type GoogleAccount,
  GOOGLE_SHEETS_SCOPE,
  type GoogleSheets,
  GoogleSheetsError,
  type GoogleSheetsErrorReason,
  googleSheetsErrorReasons,
  googleSheetsMethods,
  type ReadRowsOptions,
  type SheetDescription,
  type SheetRead,
  type SheetTab,
} from "./google-sheets.js";
export { createMemoryGoogleSheets, type MemoryGoogleSheets } from "./memory-google-sheets.js";
export { shapeRows } from "./shape-rows.js";
