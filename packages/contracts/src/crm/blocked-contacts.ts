// Blocked contacts (spec 3.6, 4): a phone, email or handle blocked from a lead, listed and unblocked in Settings.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { contactKind, peopleNames } from "./fields.js";

export const blockedContactsInput = z.strictObject({
  /** The last entry id of the previous page. */
  before: recordId.optional(),
  limit: z.int().min(1).max(50).default(25),
});
export type BlockedContactsInput = z.infer<typeof blockedContactsInput>;

export const blockedContact = z.object({
  id: recordId,
  kind: contactKind,
  /** As stored: E.164, a lower-case email, or a handle without "@". */
  value: z.string(),
  blockedBy: recordId.nullable(),
  blockedAt: z.iso.datetime(),
});
export type BlockedContact = z.infer<typeof blockedContact>;

export const blockedContactsPage = z.object({
  items: z.array(blockedContact),
  nextCursor: recordId.nullable(),
  people: peopleNames,
});
export type BlockedContactsPage = z.infer<typeof blockedContactsPage>;

export const unblockContactInput = z.strictObject({ blockedContactId: recordId });
export type UnblockContactInput = z.infer<typeof unblockContactInput>;
