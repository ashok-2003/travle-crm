// Which organization, if any, a transaction runs inside. The sweeps of tables that have no row-level security refuse to run
// inside one: they are the platform's, across every organization, and an organization's transaction (whose other tables
// show only its own rows) is the wrong place for them (SD14).
import type { OrgTx } from "./for-org.js";

/** True when the transaction has an organization set, as db.forOrg() and a platform step for one do. */
export async function insideOrganization(tx: OrgTx): Promise<boolean> {
  const [row] = await tx.$queryRaw<
    { inside: boolean }[]
  >`SELECT NULLIF(current_setting('app.org_id', true), '') IS NOT NULL AS inside`;
  return row?.inside === true;
}
