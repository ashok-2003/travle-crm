// Entry point for the email-log module only (dependency-cruiser enforces it). email_log has no organization_id: it
// keeps every email the product sends, as sent, staff alerts and the platform's own emails alike, so it has no
// row-level security. OrgTx leaves it out; this reaches it from a db.withoutOrg() or a platform transaction.
import { unscopedModel, type OrgTx } from "./for-org.js";

/** The email_log table, in a db.withoutOrg() or platform transaction. Any other transaction throws UnscopedModelError. */
export function emailLogs(tx: OrgTx) {
  return unscopedModel(tx, "emailLog");
}
