// A chat as the api shows it (spec 3.1, 3.2): the inbox's list, the header, and the messages. Outputs are z.object, which
// strips unknown keys; none holds MSG91's key, a webhook secret or a provider link to a file (the browser gets a presigned
// link from inbox.mediaUrl).
import { z } from "zod";
import { presignedUpload } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";

export const whatsappConnectionStatuses = ["setup", "connected", "paused", "problem", "disconnected"] as const;
export const whatsappConnectionStatus = z.enum(whatsappConnectionStatuses);
export type WhatsappConnectionStatus = z.infer<typeof whatsappConnectionStatus>;

export const whatsappMessageKinds = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "location",
  "contacts",
  "reaction",
  "template",
  "unsupported",
] as const;
export const whatsappMessageKind = z.enum(whatsappMessageKinds);
export type WhatsappMessageKind = z.infer<typeof whatsappMessageKind>;

export const whatsappMessageStatuses = [
  "received",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "superseded",
] as const;
export const whatsappMessageStatus = z.enum(whatsappMessageStatuses);
export type WhatsappMessageStatus = z.infer<typeof whatsappMessageStatus>;

export const whatsappMediaStates = ["none", "pending", "stored", "expired", "failed"] as const;
export const whatsappMediaState = z.enum(whatsappMediaStates);
export type WhatsappMediaState = z.infer<typeof whatsappMediaState>;

const timestamp = z.iso.datetime();

/** One of the agency's WhatsApp numbers as the inbox shows it (multi-number spec, section 11). */
export const whatsappNumber = z.object({
  id: recordId,
  /** The short name staff gave it ("Sales 1"), shown only when the agency has two or more numbers. */
  label: z.string(),
  /** E.164. */
  displayNumber: z.string(),
  status: whatsappConnectionStatus,
  /** The main number: the live one flagged main, else the oldest live one. A disconnected number is never main. */
  main: z.boolean(),
  /** The number's own AI switch; the AI answers there only while the agency's switch is on too. */
  aiAnswers: z.boolean(),
});
export type WhatsappNumber = z.infer<typeof whatsappNumber>;

/** What the inbox page needs before it shows a list: whether WhatsApp is on, connected, and in trouble (3.1). */
export const inboxStatus = z.object({
  /** The three MSG91 settings are set on this server. */
  configured: z.boolean(),
  /** The agency has a number that is connected, paused or in trouble. */
  connected: z.boolean(),
  /** The shared demo: reading works, sending is off. */
  demo: z.boolean(),
  /** Every number the agency has had, the live ones first (the main one leading), then the disconnected ones. */
  numbers: z.array(whatsappNumber),
});
export type InboxStatus = z.infer<typeof inboxStatus>;

export const conversationListItem = z.object({
  id: recordId,
  /** The number the chat is on, one of inboxStatus.numbers: a chat is one phone on one number. */
  connectionId: recordId,
  phone: z.string(),
  /** The person's name in the CRM, else the WhatsApp profile name; null for a number we know nothing of. */
  name: z.string().nullable(),
  personId: recordId.nullable(),
  /** The first words of the last message, as text ("Photo" for media); never longer than 80 characters. */
  preview: z.string(),
  lastMessageAt: timestamp.nullable(),
  /** The customer wrote last and nobody has answered. */
  needsReply: z.boolean(),
  /** The AI handed the chat to a person and nobody has answered since (the rule of the AI hand-over lists): the row's amber marker. */
  handedOver: z.boolean(),
  /** A number with no person and no lead: the row says "New number". */
  isNewNumber: z.boolean(),
  /** Who wrote the last message, and for ours how far it got: the row's ticks. */
  lastDirection: z.enum(["in", "out"]).nullable(),
  lastStatus: whatsappMessageStatus.nullable(),
  /** The lead the chat is about (the person's most recently active open lead, else their latest), as the member may see it. */
  lead: z.object({ id: recordId, stage: z.string(), ownerUserId: recordId.nullable() }).nullable(),
  /** The agency's tags on the chat (sales inbox spec 5). */
  tags: z.array(z.object({ id: recordId, name: z.string() })),
  pinned: z.boolean(),
  archived: z.boolean(),
  /** The customer's messages since this member last had the chat open, at most 99. */
  unread: z.int().min(0),
  /** When the customer started waiting for a reply (their oldest unanswered message's chat moment), or null. */
  waitingSince: timestamp.nullable(),
  snoozedUntil: timestamp.nullable(),
});
export type ConversationListItem = z.infer<typeof conversationListItem>;

export const conversationPage = z.object({
  items: z.array(conversationListItem),
  nextCursor: recordId.nullable(),
});
export type ConversationPage = z.infer<typeof conversationPage>;

/** The chat's header (3.2). */
export const conversationHeader = z.object({
  id: recordId,
  phone: z.string(),
  name: z.string().nullable(),
  personId: recordId.nullable(),
  /** The lead the header links to: the person's most recently active open lead, else their latest. */
  lead: z.object({ id: recordId, stage: z.string(), ownerUserId: recordId.nullable(), open: z.boolean() }).nullable(),
  /** Past customer: leads exist and all are closed. Start a new lead is offered. */
  pastCustomer: z.boolean(),
  /**
   * Whether the person has a lead at all (not deleted), whatever the member's own lead scope, and who works it as far as
   * they may know: whether one is theirs, and whether any has an owner. Never another member's id. Null with no lead. The
   * alerts read it: a chat with no lead, or whose leads nobody owns, is for whoever takes unassigned chats; one whose
   * lead someone else owns is theirs, though this member can't see that lead.
   */
  liveLead: z.object({ mine: z.boolean(), assigned: z.boolean() }).nullable(),
  /** The 24-hour window: until when free text may be sent, or null when it is closed or the customer never wrote. */
  windowOpenUntil: timestamp.nullable(),
  /** The customer's latest message: the window closed 24 hours after it. Null when they never wrote. */
  lastInboundAt: timestamp.nullable(),
  needsReply: z.boolean(),
  /** The destination and travel month of the person's most recently active open lead, for filling a template's blanks. */
  trip: z.object({ destination: z.string().nullable(), travelMonth: z.iso.date().nullable() }),
  /** The customer wrote STOP: no template may be sent to them. */
  optedOut: z.boolean(),
  /** Staff recorded that the person agreed to WhatsApp messages. */
  agreed: z.boolean(),
  state: z.enum(["open", "erased"]),
  tags: z.array(z.object({ id: recordId, name: z.string() })),
  pinned: z.boolean(),
  archived: z.boolean(),
  snoozedUntil: timestamp.nullable(),
  /** Teammates typing a reply in this chat right now (first names), so two don't answer at once. */
  replying: z.array(z.string()),
  /** The chat's own number: every reply goes from it, and its status says whether one can. */
  number: z.object({ id: recordId, label: z.string(), status: whatsappConnectionStatus }),
  /**
   * The customer's open chats on the agency's other numbers that the member may see, the newest first; each number's
   * status, as labels may repeat and a disconnected number's chat can't be answered.
   */
  otherChats: z.array(z.object({ id: recordId, label: z.string(), status: whatsappConnectionStatus })),
});
export type ConversationHeader = z.infer<typeof conversationHeader>;

/** The reply buttons of a card: one to three, each an id and its title. */
export const chatButtons = z
  .array(z.object({ id: z.string(), title: z.string() }))
  .min(1)
  .max(3);

export const chatMessage = z.object({
  id: recordId,
  direction: z.enum(["in", "out"]),
  origin: z.enum(["customer", "staff_crm", "staff_phone", "history", "automation"]),
  /** The AI wrote and sent it by itself (autopilot): the chat marks it as the AI's. */
  byAi: z.boolean(),
  kind: whatsappMessageKind,
  body: z.string().nullable(),
  caption: z.string().nullable(),
  fileName: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /**
   * The message this one replies to. `messageId` is null when we never had the original (a quote of a message from before we
   * were connected): the bubble then says it is not available.
   */
  quoted: z
    .object({
      messageId: recordId.nullable(),
      direction: z.enum(["in", "out"]).nullable(),
      /** The staff member who wrote it, for one of ours. */
      sentBy: recordId.nullable(),
      kind: whatsappMessageKind.nullable(),
      /** Its words, or its caption. */
      body: z.string().nullable(),
      fileName: z.string().nullable(),
      mediaState: whatsappMediaState.nullable(),
    })
    .nullable(),
  /** MSG91 would not take our quote, so the message went without it. */
  quoteDropped: z.boolean(),
  /** An emoji a reaction set on this message. */
  reaction: z.string().nullable(),
  status: whatsappMessageStatus,
  failureCode: z.string().nullable(),
  mediaState: whatsappMediaState,
  /** The staff member who sent it from here, named in the page's `people`; null for the customer's and the phone's. */
  sentBy: recordId.nullable(),
  occurredAt: timestamp,
  /** When it was sent, delivered and read (message info); each null until it happens. */
  sentAt: timestamp.nullable(),
  deliveredAt: timestamp.nullable(),
  readAt: timestamp.nullable(),
  starred: z.boolean(),
  /** What the AI agent heard in a voice note or saw in a photo; it may be wrong. */
  aiText: z.object({ kind: z.enum(["transcript", "description"]), text: z.string() }).nullable(),
  /** The reply buttons of a card the agency sent. */
  buttons: chatButtons.nullable(),
  /** The customer pressed a reply button (its words, if any, are the body). */
  tapped: z.boolean(),
});
export type ChatMessage = z.infer<typeof chatMessage>;

/**
 * What the member had not read when the chat was opened: how many of the customer's messages (at most 99) and which was the
 * first, so the chat can draw "N unread messages" above it. Only on the chat's first page, and not while searching.
 */
export const chatUnread = z.object({ count: z.int().min(0), firstMessageId: recordId.nullable() });

export const chatMessagePage = z.object({
  unread: chatUnread.nullable(),
  /** Newest first; the screen lays them out oldest at the bottom. */
  items: z.array(chatMessage),
  nextCursor: recordId.nullable(),
  /** Each sender's name by user id; a former member is left out and the screen says "a former member". */
  people: z.record(z.string(), z.string()),
});
export type ChatMessagePage = z.infer<typeof chatMessagePage>;

/** A presigned link to a message's stored file. */
/** Step one's answer: the ids the second step names, and where the browser PUTs the file. */
export const mediaUploadSlot = z.object({
  messageId: recordId,
  attachmentId: recordId,
  upload: presignedUpload,
});
export type MediaUploadSlot = z.infer<typeof mediaUploadSlot>;

/** A message just queued or found again: what the screen needs to show it at once. */
export const sentMessage = z.object({ messageId: recordId, status: whatsappMessageStatus });
export type SentMessage = z.infer<typeof sentMessage>;

export const mediaLink = z.object({
  url: z.string(),
  fileName: z.string().nullable(),
  contentType: z.string(),
  sizeBytes: z.int().nonnegative(),
});
export type MediaLink = z.infer<typeof mediaLink>;

/** The gallery's page: the messages, and a link to each one's file, signed in the same pass (one call, not one per picture). */
export const chatMediaPage = chatMessagePage.extend({ links: z.record(recordId, mediaLink) });
export type ChatMediaPage = z.infer<typeof chatMediaPage>;
