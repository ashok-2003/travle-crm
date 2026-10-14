// The in-app bell: listing a person's notifications and marking them read.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const notificationSummary = z.object({
  id: recordId,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type NotificationSummary = z.infer<typeof notificationSummary>;

/** Newest first. `cursor` is the last id of the previous page. */
export const listNotificationsInput = z.strictObject({
  cursor: recordId.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ListNotificationsInput = z.input<typeof listNotificationsInput>;

export const notificationPage = z.object({
  notifications: z.array(notificationSummary),
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type NotificationPage = z.infer<typeof notificationPage>;

export const markReadInput = z.union([
  z.strictObject({ notificationIds: z.array(recordId).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);
export type MarkReadInput = z.infer<typeof markReadInput>;
