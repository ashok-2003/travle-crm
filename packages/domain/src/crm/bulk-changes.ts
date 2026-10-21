// Changes to many leads at once (release C): each lead in a transaction of its own, through the same function a
// change to one lead uses, so its scope check, lock, audit entry, event and notice are exactly the same. A lead the
// change refuses (a DomainError: out of scope, a closed lead, not a lead worker) is skipped with its reason; any other
// failure stops the run, as it would one lead's change.
import type { BulkResult } from "@travel-crm/contracts/crm";
import type { Database, OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export async function changeEachLead(
  db: Pick<Database, "forOrg">,
  access: MemberAccess,
  leadIds: readonly string[],
  change: (tx: OrgTx, leadId: string) => Promise<unknown>,
): Promise<BulkResult> {
  const result: BulkResult = { changed: 0, skipped: [] };
  // A lead chosen twice changes once.
  for (const leadId of new Set(leadIds)) {
    try {
      await db.forOrg(access.organizationId, (tx) => change(tx, leadId));
      result.changed += 1;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      result.skipped.push({ leadId, reason: error.reason });
    }
  }
  return result;
}
