// Changes to many leads at once (release C): the list's chosen leads, up to 200 a call, each changed as if one by one,
// so its audit, events and notices are the same. A lead that can't be changed (out of the person's scope, closed for
// a follow-up) is skipped with the reason, and the rest go ahead.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { wallClockTime } from "../kernel/index.js";
import { taskKind, taskTitle } from "../tasks/index.js";
import { leadStage } from "./fields.js";

/** The most leads one call changes: a screen's chosen leads, a few pages of the list. */
export const MAX_BULK_LEADS = 200;

const leadIds = z.array(recordId).min(1).max(MAX_BULK_LEADS);

export const bulkMoveStageInput = z.strictObject({ leadIds, stage: leadStage });
export type BulkMoveStageInput = z.infer<typeof bulkMoveStageInput>;

export const bulkReassignInput = z.strictObject({ leadIds, ownerUserId: recordId });
export type BulkReassignInput = z.infer<typeof bulkReassignInput>;

export const bulkAddWorkInput = z.strictObject({ leadIds, kind: taskKind, title: taskTitle, due: wallClockTime });
export type BulkAddWorkInput = z.infer<typeof bulkAddWorkInput>;

/** How a bulk change went: how many leads changed, and each one skipped with the reason (a refusal's code). */
export const bulkResult = z.object({
  changed: z.int().min(0),
  skipped: z.array(z.object({ leadId: recordId, reason: z.string() })),
});
export type BulkResult = z.infer<typeof bulkResult>;
