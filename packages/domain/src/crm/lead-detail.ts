// A lead's page (spec 3.4): its person, trip, owner, source and open work. Out of scope is "not found" (R26). Release
// 1's Task C4 builds it.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** The lead; the router adds the names of the people it mentions. */
export const getLead: (tx: OrgTx, access: MemberAccess, leadId: string) => Promise<Omit<LeadDetail, "people">> = () => {
  throw new Error("Not built yet: release 1 plan, Task C4");
};
