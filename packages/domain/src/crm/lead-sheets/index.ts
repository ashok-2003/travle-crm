// The crm module's side of the Sheets sync (spec 6.3): a sheet's rows read into enquiries, planned, and saved by the one
// save path. The sheets module (L0) finds which rows are new; crm turns them into leads.
export { planSheetRows, type SheetPlanInput, type SheetRowDecision } from "./sheet-plan.js";
export { lookUpSheetRows, type SheetLookups } from "./sheet-lookups.js";
export { readSheetRow, sheetLeadContext, type SheetLeadContextInput } from "./sheet-rows.js";
export { checkLeadSheet, checkLeadSheetListener, type CheckLeadSheetDependencies } from "./check-lead-sheet.js";
export { noticeSheetOwners, ownersToSummarise } from "./sheet-notices.js";
export { sheetsCheckHandler } from "./check-job.js";
export { leadSheetBaselineFingerprints } from "./baseline-fingerprints.js";
