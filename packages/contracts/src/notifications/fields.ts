// Field rules shared by the notification inputs and outputs.
import { z } from "zod";

/** "<entity>.<what happened>", e.g. "share-link.opened", the same pattern as event types. Opt-outs are per kind. */
export const notificationKind = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, 'Use "entity.what-happened"');

/**
 * A path inside the web app, such as "/quotes/42". Never a full URL, and never "//host" or "/\host", which browsers
 * treat as another site: a notification link must not lead anyone off the app.
 */
export const notificationLink = z
  .string()
  .max(500)
  .regex(/^\/(?![/\\])[^\s\\]*$/, "Use a path inside the app, starting with /");

/** The channels besides the in-app bell, which every notification gets. */
export const notificationChannel = z.enum(["email", "push"]);
export type NotificationChannel = z.infer<typeof notificationChannel>;

/** A preference covers one kind, or every kind with "*". */
export const preferenceKind = z.union([notificationKind, z.literal("*")]);

/** base64url text, as browsers give push keys. */
export const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/, "Use base64url");
