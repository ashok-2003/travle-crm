// A lead's timeline and its notes (spec 3.4): what happened, newest first, and a note added to it. Release 1's Task
// C4 builds them.
import type { AddNoteInput, TimelineInput, TimelinePage } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** One page of the timeline, newest first; the router adds the names. */
export const listLeadTimeline: (
  tx: OrgTx,
  access: MemberAccess,
  input: TimelineInput,
) => Promise<Omit<TimelinePage, "people">> = () => {
  throw new Error("Not built yet: release 1 plan, Task C4");
};

/** Adds a note to the lead's timeline. */
export const addLeadNote: (tx: OrgTx, access: MemberAccess, input: AddNoteInput) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C4");
};
