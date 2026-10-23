// A connected Facebook Page as the api shows it (spec 3.1, 3.3, 6.3): its status and badge, the connect steps, and the
// lists the screens read. Outputs are z.object, which strips unknown keys; none holds a token.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

/** How many Pages an agency may connect (spec Q1): one constant, ready to become a plan limit. */
export const MAX_META_PAGES = 5;

export const metaPageStatuses = ["connecting", "running", "paused", "needs_reconnect", "disconnected"] as const;
export const metaPageStatus = z.enum(metaPageStatuses);
export type MetaPageStatus = z.infer<typeof metaPageStatus>;

/** What the Page's badge says: Running, Paused, Needs reconnecting (red) or Needs attention (amber). */
export const metaPageBadges = ["running", "paused", "needs_reconnect", "needs_attention"] as const;
export const metaPageBadge = z.enum(metaPageBadges);
export type MetaPageBadge = z.infer<typeof metaPageBadge>;

/** Meta's own id for a Page or a form: digits in practice, bounded to what the tables hold. */
export const metaId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const timestamp = z.iso.datetime();

export const metaPageListItem = z.object({
  id: recordId,
  pageName: z.string(),
  badge: metaPageBadge,
  formsBroughtIn: z.int(),
  lastCheckedAt: timestamp.nullable(),
});
export type MetaPageListItem = z.infer<typeof metaPageListItem>;

export const metaPageList = z.object({
  items: z.array(metaPageListItem),
  /** How many Pages an agency may connect. */
  limit: z.int(),
  /** False when Meta isn't set up on this server: the page says so. */
  configured: z.boolean(),
  /** The agency is the shared demo: Connect a Page is off there (spec 10). */
  demo: z.boolean(),
});
export type MetaPageList = z.infer<typeof metaPageList>;

export const metaPageDetail = z.object({
  id: recordId,
  pageName: z.string(),
  status: metaPageStatus,
  badge: metaPageBadge,
  /** Set when the badge is Needs reconnecting or Needs attention. */
  attentionSince: timestamp.nullable(),
  connectedBy: z.object({ userId: recordId, name: z.string().nullable() }).nullable(),
  connectedAt: timestamp,
  lastCheckedAt: timestamp.nullable(),
  /** The token's known expiry, when Meta gave one (spec M3). */
  tokenExpiresAt: timestamp.nullable(),
  /** A check is queued or running now, so the page asks again soon. */
  checkRunning: z.boolean(),
  /** The last check is more than an hour old, though the Page is running. */
  late: z.boolean(),
  /** The agency can't change anything today (suspended or lapsed). */
  readOnly: z.boolean(),
  counts: z.object({
    added: z.int(),
    mergedIntoExisting: z.int(),
    duplicates: z.int(),
    couldntBeAdded: z.int(),
  }),
});
export type MetaPageDetail = z.infer<typeof metaPageDetail>;

/** What connectStart answers: where to send the browser, a full address built on the server (no secret in it). */
export const metaConnectStarted = z.object({ authorizeUrl: z.url(), expiresAt: timestamp });
export type MetaConnectStarted = z.infer<typeof metaConnectStarted>;

/** Whether a Page the person shared can be connected (spec 3.2). */
export const metaPageAvailabilities = ["available", "connected_here", "connected_elsewhere", "not_allowed"] as const;
export const metaPageAvailability = z.enum(metaPageAvailabilities);
export type MetaPageAvailability = z.infer<typeof metaPageAvailability>;

/** The Pages the person shared, after Facebook's dialog. */
export const metaConnectFinished = z.object({
  pages: z.array(z.object({ pageId: metaId, name: z.string(), availability: metaPageAvailability })),
  /** The Page this login is for when it was Reconnect; null for a new connection. */
  reconnectPageRowId: recordId.nullable(),
});
export type MetaConnectFinished = z.infer<typeof metaConnectFinished>;

export const metaConnectedPages = z.object({
  connected: z.array(z.object({ id: recordId, pageId: metaId })),
  /** Pages not connected, each with the sentence's reason code (errors.json). */
  refused: z.array(z.object({ pageId: metaId, reason: z.string() })),
});
export type MetaConnectedPages = z.infer<typeof metaConnectedPages>;
