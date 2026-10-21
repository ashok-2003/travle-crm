// What an import's columns and values are matched to (spec B8-B11): the fields of both kinds, the three fields whose
// values are matched one by one, and how each match was found.
import { z } from "zod";
import { leadImportFields, type LeadImportField } from "../crm/lead-import.js";
import { staffImportFields, type StaffImportField } from "../identity/staff-import.js";

type EitherField = LeadImportField | StaffImportField;

/** Every field a column of either kind may hold: a lead file's 23, then a staff file's username and role. */
export const importFields = [...new Set<EitherField>([...leadImportFields, ...staffImportFields])] as [
  EitherField,
  ...EitherField[],
];
export const importField = z.enum(importFields);
export type ImportField = z.infer<typeof importField>;

/** The fields whose values are matched one value at a time (B11). */
export const valueFields = ["owner", "stage", "role"] as const;
export const valueField = z.enum(valueFields);
export type ValueField = z.infer<typeof valueField>;

/** How a value's target was found: an owner's name, username, email or unique first name, a word, or the importer. */
export const valueMatchedBy = ["name", "username", "email", "first_name", "word", "chosen", "none"] as const;
export type ValueMatchedBy = (typeof valueMatchedBy)[number];

/** Where a column's field came from: the agency's last import of a column of this name, or the common names (B9). */
export const guessSources = ["last-time", "common-name"] as const;
export type GuessSource = (typeof guessSources)[number];

export const importColumn = z.object({
  position: z.int(),
  header: z.string(),
  samples: z.array(z.string()),
  /** The column's values and how many rows hold each; null when it has more than 50 different ones. */
  values: z.array(z.object({ value: z.string(), rows: z.int() })).nullable(),
  field: importField.nullable(),
  guessedBy: z.enum(guessSources).nullable(),
});
export type ImportColumn = z.infer<typeof importColumn>;

export const valueMatch = z.object({
  field: valueField,
  value: z.string(),
  /** A user id, a stage or a role key; null for the file's default. */
  target: z.string().nullable(),
  matchedBy: z.enum(valueMatchedBy),
});
export type ValueMatch = z.infer<typeof valueMatch>;
