// What the inbox screens send (spec 6.3). Inputs are z.strictObject: unknown keys get a 400.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const conversationFilters = ["waiting", "all", "mine"] as const;
export const conversationFilter = z.enum(conversationFilters);
export type ConversationFilter = z.infer<typeof conversationFilter>;

export const listConversationsInput = z.strictObject({
  filter: conversationFilter.default("waiting"),
  /** A name, forgiving of typos, or four or more digits of a phone. */
  search: z.string().trim().min(2).max(80).optional(),
  /** The last conversation id of the previous page. */
  before: recordId.optional(),
  limit: z.int().min(1).max(50).default(25),
});
export type ListConversationsInput = z.infer<typeof listConversationsInput>;

export const conversationIdInput = z.strictObject({ conversationId: recordId });
export type ConversationIdInput = z.infer<typeof conversationIdInput>;

export const listMessagesInput = z.strictObject({
  conversationId: recordId,
  /** The oldest message id of the page already shown. */
  before: recordId.optional(),
  limit: z.int().min(1).max(50).default(30),
});
export type ListMessagesInput = z.infer<typeof listMessagesInput>;

/** The chat of the person a lead belongs to. */
export const leadChatInput = z.strictObject({ leadId: recordId });
export type LeadChatInput = z.infer<typeof leadChatInput>;

export const messageIdInput = z.strictObject({ messageId: recordId });
export type MessageIdInput = z.infer<typeof messageIdInput>;
