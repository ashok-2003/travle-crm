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
  .object({
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

export const updateStaffRoleInput = z.object({ memberId: recordId, roleKey });
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleInput>;

export const resetStaffPasswordInput = z.object({ memberId: recordId, temporaryPassword: newPassword });
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordInput>;

export const removeStaffInput = z.object({ memberId: recordId });
export type RemoveStaffInput = z.infer<typeof removeStaffInput>;

export const staffMember = z.object({
  memberId: z.uuid(),
  userId: z.uuid(),
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
