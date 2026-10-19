// Entry point for the sheets module's schedule only (dependency-cruiser enforces it). sheet_check_schedule and
// sheet_spreadsheet_claim carry organization_id but have no row-level security: the worker must find due sheets of every
// organization without entering one, and a spreadsheet's claim must be unique across organizations. They hold ids, times
// and a keyed hash only. OrgTx leaves them out; this reaches them from a db.withoutOrg() transaction.
import { unscopedModel, type OrgTx } from "./for-org.js";

/** The sheet_check_schedule table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function sheetSchedule(tx: OrgTx) {
  return unscopedModel(tx, "sheetCheckSchedule");
}

/** The sheet_spreadsheet_claim table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function spreadsheetClaims(tx: OrgTx) {
  return unscopedModel(tx, "sheetSpreadsheetClaim");
}
