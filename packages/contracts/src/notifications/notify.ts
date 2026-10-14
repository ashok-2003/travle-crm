// What a module passes to notify(), and the event that asks the worker to deliver one notification by email or push.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { notificationChannel, notificationKind, notificationLink } from "./fields.js";

export const notifyInput = z.strictObject({
  recipientUserIds: z.array(recordId).min(1).max(500),
  kind: notificationKind,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  link: notificationLink.optional(),
  /** Email and push as well as the bell. Each person's opt-outs still apply when it is delivered. */
  channels: z
    .array(notificationChannel)
    .refine((channels) => new Set(channels).size === channels.length, "List each channel once")
    .default([]),
});
export type NotifyInput = z.input<typeof notifyInput>;

/** The payload of "notification.created": which notification, and the channels to try. */
export const notificationCreatedEvent = z.strictObject({
  notificationId: recordId,
  channels: z.array(notificationChannel).min(1),
});
export type NotificationCreatedEvent = z.infer<typeof notificationCreatedEvent>;
