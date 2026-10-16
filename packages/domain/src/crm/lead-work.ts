// Follow-ups and tasks on a lead (spec 3.4): given to the lead's owner, due on the agency's clock. Release 1's Task C6
// builds it.
import type { AddLeadWorkInput } from "@travel-crm/contracts/crm";
import type { Task } from "@travel-crm/contracts/tasks";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** Adds a follow-up or task to the lead, for its owner, and writes follow-up-added on its timeline. */
export const addLeadWork: (
  tx: OrgTx,
  access: MemberAccess,
  input: AddLeadWorkInput,
  now: Date,
) => Promise<Task> = () => {
  throw new Error("Not built yet: release 1 plan, Task C6");
};
