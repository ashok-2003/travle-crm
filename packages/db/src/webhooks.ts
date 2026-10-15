// Entry point for the webhooks module only (dependency-cruiser enforces it). webhook_event has no organization_id,
// because the organization is unknown until a provider's handler reads the payload, so it has no row-level security
// and holds every organization's raw payloads. OrgTx leaves it out; this reaches it from a db.withoutOrg() transaction.
import { unscopedModel, type OrgTx } from "./for-org.js";

/** The webhook_event table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function webhookEvents(tx: OrgTx) {
  return unscopedModel(tx, "webhookEvent");
}
