// Inputs and outputs of the staff API: creating, changing and removing an organization's staff (spec 6.3).
import { z } from "zod";
import {
  emailAddress,
  newPassword,
  personName,
  recordId,
  roleKey,
  shownEmailAddress,
  staffUsername,
} from "./fields.js";

/**
 * Staff need an email, a username, or both: email to sign in by email, a username to sign in with the
 * organization code. The temporary password must be changed at first sign-in.
 */
export const createStaffInput = z
  .strictObject({
    name: personName,
    email: emailAddress.optional(),
    username: staffUsername.optional(),
    roleKey,
    temporaryPassword: newPassword,
  })
  .refine((input) => input.email !== undefined || input.username !== undefined, {
    message: "Give an email, a username or both",
    path: ["username"],
  });
export type CreateStaffInput = z.infer<typeof createStaffInput>;

export const updateStaffRoleInput = z.strictObject({ memberId: recordId, roleKey });
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleInput>;

export const resetStaffPasswordInput = z.strictObject({ memberId: recordId, temporaryPassword: newPassword });
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordInput>;

export const removeStaffInput = z.strictObject({ memberId: recordId });
export type RemoveStaffInput = z.infer<typeof removeStaffInput>;

/** The payload of "staff.removed": the membership removed and its user, ids only. */
export const staffRemovedEvent = z.strictObject({ memberId: recordId, userId: recordId });
export type StaffRemovedEvent = z.infer<typeof staffRemovedEvent>;

export const staffMember = z.object({
  memberId: recordId,
  userId: recordId,
  name: z.string(),
  /** Null for staff without email: their placeholder address is never shown. */
  email: shownEmailAddress.nullable(),
  /** As the person typed it, e.g. "Ravi". Null for staff who sign in only by email. */
  username: z.string().nullable(),
  role: z.object({ key: z.string(), name: z.string() }),
  twoFactorEnabled: z.boolean(),
  /** True until the person replaces the temporary password an admin gave them. */
  mustChangePassword: z.boolean(),
  joinedAt: z.iso.datetime(),
});
export type StaffMember = z.infer<typeof staffMember>;
