// The Inbox's live stream (spec 2026-11-22-inbox-revamp-design.md, part 1 item 4): `GET /api/live` answers a signed-in member
// who may read the inbox with server-sent events named `inbox`, each the id of a chat they may see and what changed in it,
// never a number, a name or a word of a message. The browser loads again only what an event touches.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const INBOX_LIVE_PATH = "/api/live";
/** The server-sent event's name. */
export const INBOX_LIVE_EVENT = "inbox";

/** A message saved, a message's status moved, or the chat's own state (waiting, pinned, archived, its tags...). */
export const inboxLiveChanges = ["message", "status", "chat"] as const;
export type InboxLiveChange = (typeof inboxLiveChanges)[number];

export const inboxLiveEvent = z.object({
  conversationId: recordId,
  change: z.enum(inboxLiveChanges),
  /** A customer's new message (not a reaction): what the browser may sound an alert for. */
  direction: z.literal("in").optional(),
});
export type InboxLiveEvent = z.infer<typeof inboxLiveEvent>;

/** The streams (tabs) one member may hold open at once; one more is refused with 429. */
export const MAX_LIVE_STREAMS_PER_MEMBER = 5;
/** A comment line goes down every stream this often, so no proxy closes a quiet one. */
export const LIVE_HEARTBEAT_MS = 25_000;
