// An import's rows (spec B24, B33, B44, D8): the check's plan for each, the add's outcome, and the reasons a row isn't
// added, with the field, the earlier row or the day each names.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { importField } from "./import-columns.js";

/**
 * What the check plans for a row: a new lead, a returning customer's, a repeat enquiry, or one of the rest. in_crm is
 * a Google Sheet's row for someone who already has a lead (the Sheets sync), left out unless the importer ticks it.
 */
export const rowPlans = ["new", "returning", "enquiry", "blocked", "already_imported", "in_crm", "not_added"] as const;
export const rowPlan = z.enum(rowPlans);
export type RowPlan = z.infer<typeof rowPlan>;

/** What the add did: added, merged into an open lead (a repeat enquiry), left out by the importer's choice, or not. */
export const rowOutcomes = ["added", "merged", "left_out", "not_added"] as const;
export const rowOutcome = z.enum(rowOutcomes);
export type RowOutcome = z.infer<typeof rowOutcome>;

/** Why a row isn't added: a lead row's reasons (B24, and a sheet's in_crm two), then a staff row's (B44, D23). */
export const rowReasonCodes = [
  "no_name",
  "no_contact",
  "not_a_lead",
  "notes_too_long",
  "same_as_row",
  "blocked",
  "already_imported",
  "in_crm_open",
  "in_crm_closed",
  "not_reached",
  "could_not_add",
  "invalid_name",
  "no_sign_in_name",
  "invalid_username",
  "invalid_email",
  "invalid_phone",
  "same_username_as_row",
  "same_email_as_row",
  "email_elsewhere",
  "role_unmatched",
  "owner_role",
  "role_above_yours",
  "already_on_staff",
  "taken_meanwhile",
] as const;
export const rowReasonCode = z.enum(rowReasonCodes);
export type RowReasonCode = z.infer<typeof rowReasonCode>;

/** A reason with what it names: "Same as row 12" (row), "Already imported on 12 Oct" (on), a field's value. */
export const rowReason = z.object({
  code: rowReasonCode,
  field: importField.optional(),
  row: z.int().min(1).optional(),
  on: calendarDate.optional(),
});
export type RowReason = z.infer<typeof rowReason>;

/** A page of example rows with one plan, and one reason when asked (the preview's "first five"). */
export const importRowsInput = z.strictObject({
  importId: recordId,
  plan: rowPlan,
  reason: rowReasonCode.optional(),
  /** The last row number of the page before. */
  after: z.int().min(0).optional(),
  limit: z.int().min(1).max(500).default(5),
});
export type ImportRowsInput = z.infer<typeof importRowsInput>;

export const importRow = z.object({
  rowNumber: z.int(),
  /** The row's name and a value, as the preview shows them; null once the sweep emptied them. */
  name: z.string().nullable(),
  value: z.string().nullable(),
  reasons: z.array(rowReason),
  outcome: rowOutcome.nullable(),
});
export type ImportRow = z.infer<typeof importRow>;

export const importRowsPage = z.object({ items: z.array(importRow), nextCursor: z.int().nullable() });
export type ImportRowsPage = z.infer<typeof importRowsPage>;
