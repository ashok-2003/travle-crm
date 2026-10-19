// A staff import's fields and its inputs (spec B43, B46): Name, Username, Email, Phone and Role, with a Role column's
// values matched to the agency's roles, or one role for the whole file; the temporary passwords' hashes, 25 a call; and
// what a staff import's page shows beyond any import's. The page's whole shape is built in the api from the shared
// importDetail (imports/import-batch.ts imports this file, so this one can't import it back).
import { z } from "zod";
import { newPassword, recordId, roleKey } from "./fields.js";

export const staffImportFields = ["name", "username", "email", "phone", "role"] as const;
export const staffImportField = z.enum(staffImportFields);
export type StaffImportField = z.infer<typeof staffImportField>;

export const matchStaffColumnsInput = z.strictObject({
  importId: recordId,
  columns: z.array(z.strictObject({ position: z.int().min(0).max(49), field: staffImportField.nullable() })).max(50),
  /** The Role values the importer changed, each to a role or null (unmatched: those rows aren't added). */
  values: z
    .array(z.strictObject({ field: z.literal("role"), value: z.string().min(1).max(200), target: roleKey.nullable() }))
    .max(2500),
  /** The role for every row when the file has no Role column. */
  defaults: z.strictObject({ roleKey: roleKey.nullable() }),
});
export type MatchStaffColumnsInput = z.infer<typeof matchStaffColumnsInput>;

/** The most passwords one setPasswords call takes (B46): about 70 ms each to hash. */
export const MAX_PASSWORDS_PER_CALL = 25;

/**
 * The temporary passwords of the rows to add, made in the browser (B46). The api hashes each and keeps only the hash on
 * the row; a row sent again takes the new password in place of the first.
 */
export const setStaffPasswordsInput = z.strictObject({
  importId: recordId,
  passwords: z
    .array(z.strictObject({ rowNumber: z.int().min(1), password: newPassword }))
    .min(1)
    .max(MAX_PASSWORDS_PER_CALL),
});
export type SetStaffPasswordsInput = z.infer<typeof setStaffPasswordsInput>;

/** The seats the plan has left for the people this file adds (B45); null for no limit. */
export const staffImportSeats = z.object({ free: z.int().nullable() });
export type StaffImportSeats = z.infer<typeof staffImportSeats>;

/** A person the import added, for the Done page's list of passwords and for B50's new ones. */
export const staffImportedPerson = z.object({
  rowNumber: z.int(),
  memberId: recordId,
  name: z.string(),
  username: z.string().nullable(),
  email: z.string().nullable(),
  /** True until they choose their own password: B50's new passwords go only to these. */
  mustChangePassword: z.boolean(),
});
export type StaffImportedPerson = z.infer<typeof staffImportedPerson>;
