// What the inbox screens send (spec 6.3). Inputs are z.strictObject: unknown keys get a 400.
import { z } from "zod";
import { attachmentFileName } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";

export const conversationFilters = ["waiting", "unread", "all", "mine", "unassigned", "archived"] as const;
export const conversationFilter = z.enum(conversationFilters);
export type ConversationFilter = z.infer<typeof conversationFilter>;

export const listConversationsInput = z.strictObject({
  filter: conversationFilter.default("waiting"),
  /** A name, forgiving of typos, or four or more digits of a phone. */
  search: z.string().trim().min(2).max(80).optional(),
  /** Only the chats carrying this tag. */
  tagId: recordId.optional(),
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

/** What staff may send as a file (spec 4.4 S4): pictures, a short video, and the documents customers ask for. */
export const whatsappSendContentTypes = [
  "image/jpeg",
  "image/png",
  "video/mp4",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  // A voice note: Opus in Ogg, or MP4 audio. WebM is not accepted by WhatsApp.
  "audio/ogg",
  "audio/mp4",
] as const;

/** The most a sent file may be: 16 MB, WhatsApp's video limit, for all kinds. */
export const MAX_WHATSAPP_SEND_BYTES = 16 * 1024 * 1024;

/** The browser's own token for one send: a double tap or a retried request is one message (unique with the organization). */
export const clientToken = z.uuid();

/** A text reply, inside the 24-hour window. */
export const sendMessageInput = z.strictObject({
  conversationId: recordId,
  clientToken,
  text: z.string().trim().min(1).max(4096),
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

/** Step one of sending a file: where the browser PUTs it. */
export const requestMediaUploadInput = z.strictObject({
  conversationId: recordId,
  fileName: attachmentFileName,
  contentType: z.enum(whatsappSendContentTypes),
  sizeBytes: z.int().min(1).max(MAX_WHATSAPP_SEND_BYTES),
});
export type RequestMediaUploadInput = z.infer<typeof requestMediaUploadInput>;

/** Step two: the uploaded file, named by the ids step one gave, with an optional caption. */
export const sendMediaInput = z.strictObject({
  conversationId: recordId,
  messageId: recordId,
  attachmentId: recordId,
  clientToken,
  caption: z.string().trim().min(1).max(1024).optional(),
});
export type SendMediaInput = z.infer<typeof sendMediaInput>;
