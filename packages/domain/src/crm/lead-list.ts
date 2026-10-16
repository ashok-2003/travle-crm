// The lead list and its stage counts (spec 3.3): a salesperson's own leads, a manager's own or everyone's, filtered
// and searched, with each row's next step. Release 1's Task C3 builds them.
import type { LeadCounts, LeadCountsInput, LeadListPage, ListLeadsInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** One page of leads, newest first; the router adds the owners' names. */
export const listLeads: (
  tx: OrgTx,
  access: MemberAccess,
  input: ListLeadsInput,
  now: Date,
) => Promise<Omit<LeadListPage, "people">> = () => {
  throw new Error("Not built yet: release 1 plan, Task C3");
};

/** Open leads by stage, for the same view and filters. */
export const countLeads: (tx: OrgTx, access: MemberAccess, input: LeadCountsInput) => Promise<LeadCounts> = () => {
  throw new Error("Not built yet: release 1 plan, Task C3");
};
