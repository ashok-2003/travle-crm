// Public API of the sheets module: connecting an agency's Google Sheet and finding which of its rows are new (spec 6.2,
// ADR 0031, L0). crm turns the rows it finds into leads; this module never calls crm or today.
export { beginSheet } from "./begin.js";
export { confirmSheet } from "./confirm.js";
export { releaseClaimIfUnused, takeSpreadsheetClaim } from "./claim.js";
export type { SheetsDependencies } from "./dependencies.js";
export {
  accountIndexFor,
  type Bytes,
  type ContactKind,
  createSheetsHashes,
  hex,
  rowHash,
  type SheetsHashes,
  uuidFromText,
} from "./hashes.js";
export { findSheet, holdSheet, sheetOf, type SheetConnectionRow } from "./connection-row.js";
export * from "./limits.js";
export { matchedFields } from "./columns.js";
export { chooseExistingRows, chooseSheetTab, matchSheetColumns } from "./steps.js";
export { verifySheet } from "./verify.js";
