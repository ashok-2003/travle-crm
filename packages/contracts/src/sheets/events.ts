// The payloads of the sheets' events (spec 7, ADR 0009): ids and reason codes, never a title, a header or a cell.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { attentionState } from "./sheet-connection.js";

/** sheet.baseline-requested: the sheet was confirmed; read its rows and start checking. */
export const sheetBaselineRequestedEvent = z.strictObject({ sheetId: recordId });
export type SheetBaselineRequestedEvent = z.infer<typeof sheetBaselineRequestedEvent>;

/** sheet.sync-requested: check now. recheck is Check again (Lost access, Tab missing): it ends the waits too. */
export const sheetSyncRequestedEvent = z.strictObject({
  sheetId: recordId,
  mode: z.enum(["sync-now", "recheck"]),
});
export type SheetSyncRequestedEvent = z.infer<typeof sheetSyncRequestedEvent>;

/** sheet.attention: the sheet changed into a state that stops rows; the Owner is told once (S45). */
export const sheetAttentionEvent = z.strictObject({ sheetId: recordId, state: attentionState });
export type SheetAttentionEvent = z.infer<typeof sheetAttentionEvent>;

/** sheet.schedule-changed: the sheet's schedule row is to be written or removed. */
export const sheetScheduleChangedEvent = z.strictObject({ sheetId: recordId });
export type SheetScheduleChangedEvent = z.infer<typeof sheetScheduleChangedEvent>;
