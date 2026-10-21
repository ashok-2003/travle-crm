// Public API of @travel-crm/integrations/spreadsheets: the spreadsheets port (spec 6.1) and its adapters.
export { neutraliseFormula } from "./formula-safety.js";
export { createMemorySpreadsheets, type MemorySpreadsheets } from "./memory-spreadsheets.js";
export { checkXlsxReading, createSpreadsheets } from "./real-spreadsheets.js";
export { columnLetters, nameHeaders } from "./sheet-shape.js";
export {
  type ColumnKind,
  type ReadLimits,
  type ReadSheet,
  type SheetRow,
  type SheetWriter,
  type SpreadsheetKind,
  type Spreadsheets,
  SpreadsheetUnreadableError,
  type UnreadableReason,
  unreadableReasons,
  type WriterColumn,
  type WrittenCell,
} from "./spreadsheets.js";
