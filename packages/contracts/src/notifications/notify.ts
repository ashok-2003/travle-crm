// What a module passes to notify(), and the event that asks the worker to deliver one notification by email or push.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { notificationChannel, notificationKind, notificationLink } from "./fields.js";

export const notifyInput = z.strictObject({
  /** Who it is for; may be empty for a team alert, which still reaches the members chosen for its copies. */
  recipientUserIds: z.array(recordId).max(500),
  /**
   * People to leave out, such as the person who acted when a listener (which has no acting person) notifies. A
   * request-time caller is left out automatically as the actor.
   */
  excludeUserIds: z.array(recordId).max(500).optional(),
  /**
   * The event this notification answers, when a listener sends it. Listeners run at least once, so a repeat of the
   * same event for the same person adds nothing: one notification per (event, person).
   */
  sourceEventId: recordId.optional(),
  kind: notificationKind,
  /** One line: it is also the email's subject. */
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\r\n]+$/, "Use a single line"),
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
