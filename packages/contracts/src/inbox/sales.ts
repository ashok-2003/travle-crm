// The sales inbox's own inputs and outputs (spec 2026-10-25-sales-inbox-design.md, section 5): the agency's tags and the
// tags on a chat, quick replies typed with "/", pinning and archiving a chat, and a member's read mark.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const MAX_TAGS_ON_A_CHAT = 10;
/** The quick reply whose words are also the reply bar's Payment details. */
export const PAYMENT_DETAILS_SHORTCUT = "payment";

export const inboxTag = z.object({ id: recordId, name: z.string() });
export type InboxTag = z.infer<typeof inboxTag>;
export const inboxTagList = z.array(inboxTag);

export const createInboxTagInput = z.strictObject({ name: z.string().trim().min(1).max(40) });
export type CreateInboxTagInput = z.infer<typeof createInboxTagInput>;

export const inboxTagIdInput = z.strictObject({ tagId: recordId });
export type InboxTagIdInput = z.infer<typeof inboxTagIdInput>;

export const setConversationTagsInput = z.strictObject({
  conversationId: recordId,
  tagIds: z.array(recordId).max(MAX_TAGS_ON_A_CHAT),
});
export type SetConversationTagsInput = z.infer<typeof setConversationTagsInput>;

export const quickReplyShortcut = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,29}$/, "Use letters, digits and dashes");

export const quickReply = z.object({ id: recordId, shortcut: z.string(), title: z.string(), body: z.string() });
export type QuickReply = z.infer<typeof quickReply>;
export const quickReplyList = z.array(quickReply);

export const quickReplyFields = {
  shortcut: quickReplyShortcut,
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4096),
};
export const createQuickReplyInput = z.strictObject(quickReplyFields);
export type CreateQuickReplyInput = z.infer<typeof createQuickReplyInput>;
export const updateQuickReplyInput = z.strictObject({ quickReplyId: recordId, ...quickReplyFields });
export type UpdateQuickReplyInput = z.infer<typeof updateQuickReplyInput>;
export const quickReplyIdInput = z.strictObject({ quickReplyId: recordId });
export type QuickReplyIdInput = z.infer<typeof quickReplyIdInput>;

/** Pin or unpin, archive or bring back. */
export const conversationFlagInput = z.strictObject({ conversationId: recordId, on: z.boolean() });
export type ConversationFlagInput = z.infer<typeof conversationFlagInput>;

/** How often an open inbox asks again for new messages, and for who else is replying (no websocket, spec 4.4 S1). */
export const INBOX_POLL_MS = 15_000;

/** How long a customer may wait for a reply before their chat counts as late (the reply timer turns red). */
export const REPLY_TARGET_MINUTES = 15;

const timestamp = z.iso.datetime();

/** The counts above the inbox: the chips' numbers and the chats by their lead's stage (sales inbox spec 6). */
export const inboxSummary = z.object({
  waiting: z.int(),
  /** Waiting longer than REPLY_TARGET_MINUTES. */
  late: z.int(),
  unread: z.int(),
  mine: z.int(),
  unassigned: z.int(),
  snoozed: z.int(),
  stages: z.object({
    new: z.int(),
    contacted: z.int(),
    quote_sent: z.int(),
    booking_requested: z.int(),
    won: z.int(),
  }),
});
export type InboxSummary = z.infer<typeof inboxSummary>;

export const starMessageInput = z.strictObject({ messageId: recordId, on: z.boolean() });
export type StarMessageInput = z.infer<typeof starMessageInput>;

/** Snooze a chat until a moment (it leaves the lists and its snoozer is reminded then), or wake it now with null. */
export const snoozeInput = z.strictObject({ conversationId: recordId, until: timestamp.nullable() });
export type SnoozeInput = z.infer<typeof snoozeInput>;

export const MAX_NOTE_LENGTH = 2000;
/** A team note in a chat is a note on the chat's lead (crm's lead notes), shown among the messages at its time. */
export const conversationNote = z.object({
  id: recordId,
  body: z.string(),
  createdBy: recordId.nullable(),
  createdAt: timestamp,
});
export type ConversationNote = z.infer<typeof conversationNote>;
export const conversationNoteList = z.object({
  items: z.array(conversationNote),
  /** The lead the notes belong to; null when the chat has none yet, so no note can be written. */
  leadId: recordId.nullable(),
  /** Each writer's name by user id. */
  people: z.record(z.string(), z.string()),
});
export type ConversationNoteList = z.infer<typeof conversationNoteList>;
export const addConversationNoteInput = z.strictObject({
  conversationId: recordId,
  body: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
  /** Teammates named with "@": told, if they may see the chat's lead. Nothing about them is stored. */
  mentions: z.array(recordId).max(20).default([]),
});
export type AddConversationNoteInput = z.infer<typeof addConversationNoteInput>;

export const scheduledMessageStatuses = ["pending", "sent", "cancelled", "failed"] as const;
export const scheduledMessage = z.object({
  id: recordId,
  body: z.string(),
  sendAt: timestamp,
  status: z.enum(scheduledMessageStatuses),
  failureCode: z.string().nullable(),
});
export type ScheduledMessage = z.infer<typeof scheduledMessage>;
export const scheduledMessageList = z.array(scheduledMessage);
export const scheduleMessageInput = z.strictObject({
  conversationId: recordId,
  body: z.string().trim().min(1).max(4096),
  sendAt: timestamp,
});
export type ScheduleMessageInput = z.infer<typeof scheduleMessageInput>;
export const scheduledIdInput = z.strictObject({ scheduledId: recordId });
export type ScheduledIdInput = z.infer<typeof scheduledIdInput>;

/** The agency's automatic answers (sales inbox spec 6). Hours are minutes after midnight in the agency's zone. */
export const inboxAutomation = z.object({
  awayEnabled: z.boolean(),
  awayMessage: z.string(),
  openFrom: z.int(),
  openUntil: z.int(),
  openDays: z.array(z.int()),
  welcomeEnabled: z.boolean(),
  welcomeMessage: z.string(),
});
export type InboxAutomation = z.infer<typeof inboxAutomation>;
export const saveInboxAutomationInput = z
  .strictObject({
    awayEnabled: z.boolean(),
    awayMessage: z.string().trim().max(1000),
    openFrom: z.int().min(0).max(1439),
    openUntil: z.int().min(1).max(1440),
    openDays: z.array(z.int().min(0).max(6)).max(7),
    welcomeEnabled: z.boolean(),
    welcomeMessage: z.string().trim().max(1000),
  })
  .refine((value) => value.openFrom < value.openUntil, { path: ["openUntil"], message: "After the opening time" })
  .refine((value) => !value.awayEnabled || value.awayMessage !== "", { path: ["awayMessage"], message: "Required" })
  .refine((value) => !value.welcomeEnabled || value.welcomeMessage !== "", {
    path: ["welcomeMessage"],
    message: "Required",
  });
export type SaveInboxAutomationInput = z.infer<typeof saveInboxAutomationInput>;

export const keywordReply = z.object({ id: recordId, keyword: z.string(), reply: z.string(), enabled: z.boolean() });
export type KeywordReply = z.infer<typeof keywordReply>;
export const keywordReplyList = z.array(keywordReply);
export const createKeywordReplyInput = z.strictObject({
  keyword: z.string().trim().toLowerCase().min(2).max(40),
  reply: z.string().trim().min(1).max(1000),
});
export type CreateKeywordReplyInput = z.infer<typeof createKeywordReplyInput>;
export const keywordReplyIdInput = z.strictObject({ keywordReplyId: recordId });
export type KeywordReplyIdInput = z.infer<typeof keywordReplyIdInput>;

export const broadcastSummary = z.object({
  id: recordId,
  templateName: z.string(),
  tagName: z.string(),
  status: z.enum(["queued", "sending", "done"]),
  total: z.int(),
  sent: z.int(),
  skipped: z.int(),
  createdAt: timestamp,
});
export type BroadcastSummary = z.infer<typeof broadcastSummary>;
export const broadcastList = z.array(broadcastSummary);
export const createBroadcastInput = z.strictObject({
  templateId: recordId,
  tagId: recordId,
  params: z.array(z.string().trim().min(1).max(200)).max(10),
});
export type CreateBroadcastInput = z.infer<typeof createBroadcastInput>;
/** How many chats a broadcast to a tag would reach, and how many of those may be sent a template. */
export const broadcastReach = z.object({ chats: z.int(), allowed: z.int() });
export const broadcastReachInput = z.strictObject({ tagId: recordId });
