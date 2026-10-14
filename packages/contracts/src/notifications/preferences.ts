// Each person's opt-outs (spec 9.4: DPDP and WhatsApp rules) and their browsers' push subscriptions.
import { z } from "zod";
import { base64url, notificationChannel, preferenceKind } from "./fields.js";

/** Turns email or push off (or back on) for one kind, or for every kind with "*". A kind's own setting wins. */
export const notificationPreferenceInput = z.strictObject({
  channel: notificationChannel,
  kind: preferenceKind,
  optedOut: z.boolean(),
});
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceInput>;

export const notificationPreference = z.object({
  channel: notificationChannel,
  kind: z.string(),
  optedOut: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreference>;

/** PushSubscription.toJSON() from the browser. Push services are always https. */
export const pushSubscriptionInput = z.strictObject({
  endpoint: z.url({ protocol: /^https$/, message: "Push services use https" }).max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    /** A P-256 public key: 65 bytes, 87 characters of base64url. */
    p256dh: base64url.length(87),
    /** 16 bytes, 22 characters of base64url. */
    auth: base64url.length(22),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>;

export const removePushSubscriptionInput = z.strictObject({
  endpoint: z.string().min(1).max(2048),
});
export type RemovePushSubscriptionInput = z.infer<typeof removePushSubscriptionInput>;
