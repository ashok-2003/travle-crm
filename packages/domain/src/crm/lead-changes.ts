// Changes from a lead's page (spec 3.4, 4): its stage, reopening, its owner, its trip and its person. The stage and
// owner changes go through lead-core.ts. Release 1's Task C5 builds them.
import type {
  EditPersonInput,
  EditTripInput,
  LeadIdInput,
  MoveStageInput,
  ReassignLeadInput,
} from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** Moves the lead to a stage, forwards or back; the stage it is in already changes nothing (R31). */
export const moveLeadStage: (
  tx: OrgTx,
  access: MemberAccess,
  input: MoveStageInput,
  now: Date,
) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C5");
};

/** Returns a closed lead to the open stage it left, or New (R30); an open lead changes nothing. */
export const reopenLead: (tx: OrgTx, access: MemberAccess, input: LeadIdInput, now: Date) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C5");
};

/** Gives the lead to someone who can work leads (`owners`, R14). */
export const reassignLead: (
  tx: OrgTx,
  access: MemberAccess,
  input: ReassignLeadInput,
  context: { owners: ReadonlySet<string>; now: Date },
) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C5");
};

/** Replaces the lead's trip. */
export const editLeadTrip: (tx: OrgTx, access: MemberAccess, input: EditTripInput) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C5");
};

/** Replaces the lead's person's name and contacts; a contact on another live person is refused. */
export const editLeadPerson: (tx: OrgTx, access: MemberAccess, input: EditPersonInput) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C5");
};
