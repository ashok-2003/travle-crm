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
