// Entry point for the api's sheets-key-check.ts only (dependency-cruiser enforces it). sheets_key_check has no
// organization_id, so it has no row-level security: it holds one keyed hash of a constant, for every process to compare.
// OrgTx leaves it out; this reaches it from a db.withoutOrg() transaction.
import { unscopedModel, type OrgTx } from "./for-org.js";

/** The sheets_key_check table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function sheetsKeyChecks(tx: OrgTx) {
  return unscopedModel(tx, "sheetsKeyCheck");
}
