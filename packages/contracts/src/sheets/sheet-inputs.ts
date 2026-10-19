// What the sheet screens send (spec 6.5): a sheet is named by its id alone, except in `begin`, which takes the pasted
// link. Inputs are z.strictObject: unknown keys get a 400.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { MAX_MATCHED_VALUE_LENGTH } from "../crm/lead-import.js";
import { existingRowChoice, sheetField } from "./sheet-connection.js";

export const sheetIdInput = z.strictObject({ sheetId: recordId });
export type SheetIdInput = z.infer<typeof sheetIdInput>;

/**
 * The pasted address, as typed. The procedure reads it with parseSheetLink and refuses a bad one with the reason
 * SHEET_LINK_INVALID, so the screen shows that reason's own sentence; sheetLink does the same check for a form.
 */
export const beginSheetInput = z.strictObject({ link: z.string().trim().min(1).max(2000) });
export type BeginSheetInput = z.infer<typeof beginSheetInput>;

const headerKey = z.string().min(1).max(200);

/** Describe the tab again, and list the values of one column (the Owner column) with their rows. */
export const verifySheetInput = z.strictObject({ sheetId: recordId, valuesOf: headerKey.optional() });
export type VerifySheetInput = z.infer<typeof verifySheetInput>;

export const chooseSheetTabInput = z.strictObject({ sheetId: recordId, tabGid: z.string().min(1).max(20) });
export type ChooseSheetTabInput = z.infer<typeof chooseSheetTabInput>;

/** The columns' fields, and the Owner values the person matched by hand (null: the agency Owner). */
export const matchSheetColumnsInput = z.strictObject({
  sheetId: recordId,
  columns: z.array(z.strictObject({ headerKey, field: sheetField.nullable() })).max(50),
  values: z
    .array(
      z.strictObject({
        value: z.string().min(1).max(MAX_MATCHED_VALUE_LENGTH),
        target: recordId.nullable(),
      }),
    )
    .max(5000),
});
export type MatchSheetColumnsInput = z.infer<typeof matchSheetColumnsInput>;

export const chooseExistingInput = z.strictObject({ sheetId: recordId, existingRows: existingRowChoice });
export type ChooseExistingInput = z.infer<typeof chooseExistingInput>;

/** Check again for Lost access or Tab missing, with another tab when the old one is gone (S40). */
export const recheckSheetInput = z.strictObject({ sheetId: recordId, tabGid: z.string().min(1).max(20).optional() });
export type RecheckSheetInput = z.infer<typeof recheckSheetInput>;

export const hideProblemInput = z.strictObject({ sheetId: recordId, rowId: recordId });
export type HideProblemInput = z.infer<typeof hideProblemInput>;

export const sheetProblemsInput = z.strictObject({
  sheetId: recordId,
  after: recordId.optional(),
  limit: z.int().min(1).max(100).default(50),
});
export type SheetProblemsInput = z.input<typeof sheetProblemsInput>;
