// Entry point for the inbox module's routes only (dependency-cruiser enforces it). whatsapp_number_route carries
// organization_id but has no row-level security, and whatsapp_unrouted has no organization at all: the webhook must find an
// agency from MSG91's integrated number without entering one (ADR 0035). Both hold ids, numbers and counts only. OrgTx leaves
// them out; this reaches them from a db.withoutOrg() transaction.
import { unscopedModel, type OrgTx } from "./for-org.js";

/** The whatsapp_number_route table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function whatsappNumberRoutes(tx: OrgTx) {
  return unscopedModel(tx, "whatsappNumberRoute");
}

/** The whatsapp_unrouted table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function whatsappUnrouted(tx: OrgTx) {
  return unscopedModel(tx, "whatsappUnrouted");
}
