// Entry point for the rate-limits module only (dependency-cruiser enforces it). rate_limit_counter has no
// organization_id, because a key names a limit and a client, so it has no row-level security. OrgTx leaves it out;
// this reaches it from a db.withoutOrg() transaction.
import { unscopedModel, type OrgTx } from "./for-org.js";

/** The rate_limit_counter table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function rateLimitCounters(tx: OrgTx) {
  return unscopedModel(tx, "rateLimitCounter");
}
