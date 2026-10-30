// Follow-ups and tasks as the api carries them (spec 3.5): one due on the agency's clock, done, or snoozed by one of
// three choices. A follow-up is always on a record (a lead); a task may be, or may stand alone.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { wallClockTime } from "../kernel/time.js";

export const taskKinds = ["follow-up", "task"] as const;
export const taskKind = z.enum(taskKinds);
export type TaskKind = z.infer<typeof taskKind>;

/** What to do, in a short line: "Send the Kashmir quote". */
export const taskTitle = z.string().trim().min(1, "Say what to do").max(200);

/** The record a task is about, e.g. { recordType: "lead", recordId }. */
export const taskRecord = z.object({ recordType: z.string(), recordId });
export type TaskRecord = z.infer<typeof taskRecord>;

export const task = z.object({
  id: recordId,
  kind: taskKind,
  /** Empty only once erasure has emptied it. */
  title: z.string(),
  dueAt: z.iso.datetime(),
  /** When it was first due, kept through every snooze. */
  firstDueAt: z.iso.datetime(),
  assigneeUserId: recordId.nullable(),
  record: taskRecord.nullable(),
  doneAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
export type Task = z.infer<typeof task>;

/** A standalone task: yours, or someone else's with leads:assign. */
export const addTaskInput = z.strictObject({
  title: taskTitle,
  due: wallClockTime,
  assigneeUserId: recordId.nullable(),
});
export type AddTaskInput = z.infer<typeof addTaskInput>;

export const taskIdInput = z.strictObject({ taskId: recordId });

/** A follow-up or task changed: what to do and when (the Follow-ups screen, 2026-10-30). */
export const editTaskInput = z.strictObject({ taskId: recordId, title: taskTitle, due: wallClockTime });
export type EditTaskInput = z.infer<typeof editTaskInput>;
export type TaskIdInput = z.infer<typeof taskIdInput>;

/** One hour from now, tomorrow at 09:00 on the agency's clock, or a chosen day and time. */
export const snoozeUntil = z.discriminatedUnion("choice", [
  z.strictObject({ choice: z.literal("one-hour") }),
  z.strictObject({ choice: z.literal("tomorrow-morning") }),
  z.strictObject({ choice: z.literal("at"), due: wallClockTime }),
]);
export type SnoozeUntil = z.infer<typeof snoozeUntil>;

export const snoozeTaskInput = z.strictObject({ taskId: recordId, until: snoozeUntil });
export type SnoozeTaskInput = z.infer<typeof snoozeTaskInput>;

/** The payload of task.added, task.done, task.snoozed, task.edited, task.cancelled and task.reassigned: ids only. */
export const taskEvent = z.strictObject({ taskId: recordId });
export type TaskEvent = z.infer<typeof taskEvent>;
