// Broadcasts (sales inbox spec 6, rebuilt 2026-10-26): one approved template to the chats carrying any of some tags. The
// platform pays Meta and agencies get WhatsApp as fair use, so every figure here is a count or a share of the month's
// allowance, never a rupee. Written by the Owner and Admins (inbox:templates), through fresh sessions.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const MAX_BROADCAST_TAGS = 5;
export const MAX_BROADCAST_PARAMS = 10;
/** Past this share of settled messages refused by WhatsApp, a broadcast pauses itself (with at least BROADCAST_PAUSE_MIN_SETTLED). */
export const BROADCAST_PAUSE_FAILURE_RATE = 0.2;
export const BROADCAST_PAUSE_MIN_SETTLED = 10;
/** The day's template cap leaves the rest waiting until this hour (the organization's time zone) of the next day. */
export const BROADCAST_NEXT_DAY_HOUR = 10;

const audience = {
  templateId: recordId,
  tagIds: z.array(recordId).min(1).max(MAX_BROADCAST_TAGS),
  /** The template's blanks, the same for everyone. */
  params: z.array(z.string().trim().min(1).max(200)).max(MAX_BROADCAST_PARAMS),
};
export const broadcastPreviewInput = z.strictObject(audience);
export type BroadcastPreviewInput = z.infer<typeof broadcastPreviewInput>;
export const createBroadcastInput = z.strictObject({ requestId: z.uuid(), ...audience });
export type CreateBroadcastInput = z.infer<typeof createBroadcastInput>;

/** Who a broadcast would reach, who is left out and why, and what is left of the month's allowance. */
export const broadcastPreview = z.object({
  /** Chats that will get it. */
  willSend: z.int(),
  leftOut: z.object({
    optedOut: z.int(),
    noConsent: z.int(),
    outsideVisibility: z.int(),
    overAllowance: z.int(),
  }),
  /** The month's marketing allowance (null for a template that is not marketing: it has none). */
  allowance: z.object({ limit: z.int(), used: z.int(), remaining: z.int() }).nullable(),
  /** How many go today and how many wait for the next morning, under the day's template cap. */
  today: z.object({ sendToday: z.int(), waitForTomorrow: z.int() }),
});
export type BroadcastPreview = z.infer<typeof broadcastPreview>;

export const broadcastStatuses = ["sending", "paused", "cancelled", "done"] as const;
export const broadcastPausedReasons = ["failure_rate", "template_unavailable"] as const;
export const recipientStates = ["waiting", "sent", "skipped", "failed"] as const;

export const broadcastCounts = z.object({
  total: z.int(),
  waiting: z.int(),
  sent: z.int(),
  skipped: z.int(),
  failed: z.int(),
});
export type BroadcastCounts = z.infer<typeof broadcastCounts>;

export const broadcastSummary = z.object({
  id: recordId,
  templateName: z.string(),
  /** What each chat was sent: the template's words with the blanks filled in. */
  message: z.string(),
  tagNames: z.array(z.string()),
  status: z.enum(broadcastStatuses),
  pausedReason: z.enum(broadcastPausedReasons).nullable(),
  counts: broadcastCounts,
  createdBy: recordId,
  createdAt: z.iso.datetime(),
});
export type BroadcastSummary = z.infer<typeof broadcastSummary>;
export const broadcastList = z.object({
  items: z.array(broadcastSummary),
  /** The creators' names by user id. */
  people: z.record(z.string(), z.string()),
});

export const broadcastRecipient = z.object({
  id: recordId,
  conversationId: recordId,
  name: z.string().nullable(),
  phone: z.string(),
  state: z.enum(recipientStates),
  reason: z.string().nullable(),
  /** When a waiting recipient is next tried, if not now. */
  notBefore: z.iso.datetime().nullable(),
});
export type BroadcastRecipient = z.infer<typeof broadcastRecipient>;

export const broadcastDetail = z.object({
  broadcast: broadcastSummary,
  recipients: z.array(broadcastRecipient),
  nextCursor: recordId.nullable(),
  people: z.record(z.string(), z.string()),
});
export type BroadcastDetail = z.infer<typeof broadcastDetail>;
export const broadcastDetailInput = z.strictObject({
  broadcastId: recordId,
  before: recordId.optional(),
  limit: z.int().min(1).max(100).default(50),
});
export const broadcastIdInput = z.strictObject({ broadcastId: recordId });
export type BroadcastIdInput = z.infer<typeof broadcastIdInput>;
export const broadcastCreated = z.object({ id: recordId });
