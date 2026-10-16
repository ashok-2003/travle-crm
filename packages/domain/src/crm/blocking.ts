// Blocking a lead's contact (spec 3.4, 4): Not a lead plus the blocked list, which only warns in release 1; the list
// and Unblock in Settings (R33). Release 1's Task C6 builds them.
import type {
  BlockedContactsInput,
  BlockedContactsPage,
  LeadIdInput,
  UnblockContactInput,
} from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** Blocks the lead's phone, else its email, else its handle, and marks the lead Not a lead. */
export const blockLeadContact: (
  tx: OrgTx,
  access: MemberAccess,
  input: LeadIdInput,
  now: Date,
) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C6");
};

/** One page of blocked contacts, newest first; the router adds the names. */
export const listBlockedContacts: (
  tx: OrgTx,
  input: BlockedContactsInput,
) => Promise<Omit<BlockedContactsPage, "people">> = () => {
  throw new Error("Not built yet: release 1 plan, Task C6");
};

/** Unblocks a contact, so it can be blocked again later. */
export const unblockContact: (tx: OrgTx, access: MemberAccess, input: UnblockContactInput) => Promise<void> = () => {
  throw new Error("Not built yet: release 1 plan, Task C6");
};
