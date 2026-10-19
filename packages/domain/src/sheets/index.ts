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
export { followUpFullRead, dailyReadDue, decideRead, type CheckMode, type ReadPlan } from "./read-plan.js";
export { numberRows, type ReadRow } from "./numbered-rows.js";
export { clearVanishedRows, firstPendingRow, isKnown, ledgerKey, lookUpLedger, type LedgerEntry } from "./ledger.js";
export { nameColumns, type HeaderName } from "./header-keys.js";
export { earlierSheetFingerprints } from "./fingerprints.js";
export { monthFirstLocale, sheetOrigin, sheetOriginOf } from "./origin.js";
export { headerHashOf, matchHeader, stopsTheCheck, type HeaderMatch, type SheetColumnRow } from "./header-match.js";
export { baselineListener } from "./baseline.js";
export { matchSheetImportListener } from "./match-connect-import.js";
export { hasScheduleRow, scheduleListener } from "./update-schedule.js";
export { attentionListener, enterAttention } from "./attention.js";
export type { SheetsJobDependencies } from "./job-dependencies.js";
export { createAccountHolds, type AccountHolds } from "./account-holds.js";
export { closeCheck, type CheckClose } from "./check-close.js";
export type { CheckDependencies, CheckOutcome } from "./check-outcome.js";
export { connectorAccess, connectorPermissions } from "./connector-access.js";
export { handleReadFailure } from "./read-failure.js";
export { leaveAttention } from "./attention.js";
export { disconnectSheet, pauseSheet, recheckSheet, requestSyncNow, resumeSheet } from "./controls.js";
export { hideProblem, sheetProblems } from "./problems.js";
export { takeOverSheet } from "./take-over.js";
export { readSheetTab, rowsFrom, type TabRead } from "./read-tab.js";
export { storedColumns, type StoredColumn } from "./verify.js";
