// A staff import's fields and its match input (spec B43): Name, Username, Email, Phone and Role, with a Role column's
// values matched to the agency's roles, or one role for the whole file. The staff import adds its own shapes here later.
import { z } from "zod";
import { MAX_LISTED_VALUES } from "../imports/import-batch.js";
import { recordId, roleKey } from "./fields.js";

export const staffImportFields = ["name", "username", "email", "phone", "role"] as const;
export const staffImportField = z.enum(staffImportFields);
export type StaffImportField = z.infer<typeof staffImportField>;

export const matchStaffColumnsInput = z.strictObject({
  importId: recordId,
  columns: z.array(z.strictObject({ position: z.int().min(0).max(49), field: staffImportField.nullable() })).max(50),
  /** The Role values the importer changed, each to a role or null (unmatched: those rows aren't added); 50 at most. */
  values: z
    .array(z.strictObject({ field: z.literal("role"), value: z.string().min(1).max(200), target: roleKey.nullable() }))
    .max(MAX_LISTED_VALUES),
  /** The role for every row when the file has no Role column. */
  defaults: z.strictObject({ roleKey: roleKey.nullable() }),
});
export type MatchStaffColumnsInput = z.infer<typeof matchStaffColumnsInput>;
