// The rows a sheet couldn't add (S27): why, and the first cell's text, so the agency can fix the row in its sheet.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

/** The reasons of a single row (B24's that apply) plus a blocked contact and an erased customer (S23). */
export const sheetProblemReasons = ["no_name", "no_contact", "notes_too_long", "blocked", "erased"] as const;
export const sheetProblemReason = z.enum(sheetProblemReasons);
export type SheetProblemReason = z.infer<typeof sheetProblemReason>;

/** A ledger row's status (S19): the first four are known and never read again, the last two wait or are listed. */
export const sheetRowStatuses = [
  "before_connect",
  "pending",
  "added",
  "merged",
  "duplicate",
  "not_added",
  "erased",
] as const;
export const sheetRowStatus = z.enum(sheetRowStatuses);
export type SheetRowStatus = z.infer<typeof sheetRowStatus>;

export const sheetProblem = z.object({
  id: recordId,
  rowNumber: z.int(),
  name: z.string().nullable(),
  value: z.string().nullable(),
  reason: sheetProblemReason,
  firstSeenAt: z.iso.datetime(),
});
export type SheetProblem = z.infer<typeof sheetProblem>;

export const sheetProblemsPage = z.object({
  items: z.array(sheetProblem),
  nextCursor: recordId.nullable(),
});
export type SheetProblemsPage = z.infer<typeof sheetProblemsPage>;
