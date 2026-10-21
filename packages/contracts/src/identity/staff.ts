// Inputs and outputs of the staff API: creating, changing and removing an organization's staff (spec 6.3).
import { z } from "zod";
import { phoneNumber } from "../kernel/phone.js";
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
    /** Optional (B51): not a sign-in name, not unique. */
    phone: phoneNumber.optional(),
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

/** A staff member's phone, or null to clear it (B51). */
export const changeStaffPhoneInput = z.strictObject({ memberId: recordId, phone: phoneNumber.nullable() });
export type ChangeStaffPhoneInput = z.infer<typeof changeStaffPhoneInput>;

export const removeStaffInput = z.strictObject({ memberId: recordId });
export type RemoveStaffInput = z.infer<typeof removeStaffInput>;

/** The payload of "staff.invited": the member to email a link to choose their password, ids only. */
export const staffInvitedEvent = z.strictObject({ memberId: recordId, userId: recordId });
export type StaffInvitedEvent = z.infer<typeof staffInvitedEvent>;

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
  /** In E.164; null when none was given (B51). */
  phone: z.string().nullable(),
  /** isOwner: the Owner role, which screens colour as theirs even where the roles list is refused (suspended). */
  role: z.object({ key: z.string(), name: z.string(), isOwner: z.boolean() }),
  twoFactorEnabled: z.boolean(),
  /** True until the person replaces the temporary password an admin gave them. */
  mustChangePassword: z.boolean(),
  joinedAt: z.iso.datetime(),
});
export type StaffMember = z.infer<typeof staffMember>;
