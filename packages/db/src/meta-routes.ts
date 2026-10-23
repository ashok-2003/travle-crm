// Entry point for the meta-leads module's routes only (dependency-cruiser enforces it). meta_page_route carries
// organization_id but has no row-level security: the webhook must find a Page's organization, and the worker the Pages
// whose catch-up is due, without entering one, and a Page may belong to one agency across all of them (M4). It holds ids
// and times only. OrgTx leaves it out; this reaches it from a db.withoutOrg() transaction.
import { unscopedModel, type OrgTx } from "./for-org.js";

/** The meta_page_route table, in a db.withoutOrg() transaction. Any other transaction throws UnscopedModelError. */
export function metaRoutes(tx: OrgTx) {
  return unscopedModel(tx, "metaPageRoute");
}
