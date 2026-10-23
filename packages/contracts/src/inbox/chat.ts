// A chat as the api shows it (spec 3.1, 3.2): the inbox's list, the header, and the messages. Outputs are z.object, which
// strips unknown keys; none holds MSG91's key, a webhook secret or a provider link to a file (the browser gets a presigned
// link from inbox.mediaUrl).
import { z } from "zod";
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

/** What the inbox page needs before it shows a list: whether WhatsApp is on, connected, and in trouble (3.1). */
export const inboxStatus = z.object({
  /** The three MSG91 settings are set on this server. */
  configured: z.boolean(),
  /** The agency has a number that is connected, paused or in trouble. */
  connected: z.boolean(),
  connectionStatus: whatsappConnectionStatus.nullable(),
  /** The shared demo: reading works, sending is off. */
  demo: z.boolean(),
  /** The number as the agency knows it, E.164. */
  number: z.string().nullable(),
});
export type InboxStatus = z.infer<typeof inboxStatus>;

export const conversationListItem = z.object({
  id: recordId,
  phone: z.string(),
  /** The person's name in the CRM, else the WhatsApp profile name; null for a number we know nothing of. */
  name: z.string().nullable(),
  personId: recordId.nullable(),
  /** The first words of the last message, as text ("Photo" for media); never longer than 80 characters. */
  preview: z.string(),
  lastMessageAt: timestamp.nullable(),
  /** The customer wrote last and nobody has answered. */
  needsReply: z.boolean(),
  /** A number with no person and no lead: the row says "New number". */
  isNewNumber: z.boolean(),
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
  /** The 24-hour window: until when free text may be sent, or null when it is closed or the customer never wrote. */
  windowOpenUntil: timestamp.nullable(),
  needsReply: z.boolean(),
  state: z.enum(["open", "erased"]),
});
export type ConversationHeader = z.infer<typeof conversationHeader>;

export const chatMessage = z.object({
  id: recordId,
  direction: z.enum(["in", "out"]),
  origin: z.enum(["customer", "staff_crm", "staff_phone", "history"]),
  kind: whatsappMessageKind,
  body: z.string().nullable(),
  caption: z.string().nullable(),
  fileName: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** The message this one replies to, as far as we have it. */
  quoted: z.object({ kind: whatsappMessageKind, body: z.string().nullable() }).nullable(),
  /** An emoji a reaction set on this message. */
  reaction: z.string().nullable(),
  status: whatsappMessageStatus,
  failureCode: z.string().nullable(),
  mediaState: whatsappMediaState,
  /** The staff member's first name under our messages. */
  sentByName: z.string().nullable(),
  occurredAt: timestamp,
});
export type ChatMessage = z.infer<typeof chatMessage>;

export const chatMessagePage = z.object({
  /** Newest first; the screen lays them out oldest at the bottom. */
  items: z.array(chatMessage),
  nextCursor: recordId.nullable(),
});
export type ChatMessagePage = z.infer<typeof chatMessagePage>;

/** A presigned link to a message's stored file. */
export const mediaLink = z.object({ url: z.string(), fileName: z.string().nullable(), contentType: z.string() });
export type MediaLink = z.infer<typeof mediaLink>;
