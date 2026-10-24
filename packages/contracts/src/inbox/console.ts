// WhatsApp in the platform console (spec 3.5): the connections, one organization's connection and the webhook block.
// Outputs are z.object. The webhook block is the only place the secrets appear, for super admins alone.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { phoneNumber } from "../kernel/index.js";
import { whatsappConnectionStatus } from "./chat.js";

const timestamp = z.iso.datetime();

export const whatsappModes = ["new_number", "coexistence", "demo"] as const;
export const whatsappMode = z.enum(whatsappModes);
export type WhatsappMode = z.infer<typeof whatsappMode>;

export const MARKETING_CAP_DEFAULT = 300;
export const TEMPLATE_CAP_DEFAULT = 100;

/** MSG91 writes a number as digits with the country code. */
export const integratedNumber = z.string().regex(/^[0-9]{8,15}$/, "Use the number's digits with the country code");

export const connectWhatsappInput = z.strictObject({
  organizationId: recordId,
  /** The number the agency's customers message. */
  displayNumber: phoneNumber,
  integratedNumber,
  mode: z.enum(["new_number", "coexistence"]),
  providerRef: z.string().trim().max(200).optional(),
  wabaId: z.string().trim().max(100).optional(),
  phoneNumberId: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});
export type ConnectWhatsappInput = z.infer<typeof connectWhatsappInput>;

export const whatsappOrganizationInput = z.strictObject({ organizationId: recordId });
export type WhatsappOrganizationInput = z.infer<typeof whatsappOrganizationInput>;

export const whatsappUsageRow = z.object({
  month: z.string(),
  inbound: z.int(),
  replies: z.int(),
  utility: z.int(),
  marketing: z.int(),
  failed: z.int(),
});
export type WhatsappUsageRow = z.infer<typeof whatsappUsageRow>;

export const consoleConnection = z.object({
  id: recordId,
  organizationId: recordId,
  organizationName: z.string(),
  displayNumber: z.string(),
  mode: whatsappMode,
  status: whatsappConnectionStatus,
  connectedAt: timestamp.nullable(),
  lastEventAt: timestamp.nullable(),
  /** The first MSG91 event for the number was seen: only then may it be marked connected. */
  webhookSeenAt: timestamp.nullable(),
  messagesThisMonth: z.object({ inbound: z.int(), outbound: z.int(), marketing: z.int() }),
  marketingCapMonth: z.int(),
  templateCapDay: z.int(),
  /** Over the soft fair-use line (5,000 outbound a month): the row turns amber. */
  overFairUse: z.boolean(),
  /** The subscription is cancelled while the number is still connected: our team removes it in MSG91's panel. */
  cancelledButConnected: z.boolean(),
  problemSince: timestamp.nullable(),
  qualityRating: z.string().nullable(),
  note: z.string().nullable(),
});
export type ConsoleConnection = z.infer<typeof consoleConnection>;

export const consoleConnectionList = z.object({
  items: z.array(consoleConnection),
  /** Numbers MSG91 sent events for that no agency has recorded (a number added in the panel but not here). */
  unrouted: z.array(z.object({ integratedNumber: z.string(), events: z.int(), lastSeenAt: timestamp })),
  /** The three settings are set on this server. */
  configured: z.boolean(),
});
export type ConsoleConnectionList = z.infer<typeof consoleConnectionList>;

/** One organization's WhatsApp group: its connection (or none), whether it could be connected, and its usage. */
export const consoleOrganizationWhatsapp = z.object({
  configured: z.boolean(),
  connection: consoleConnection.nullable(),
  usage: z.array(whatsappUsageRow),
  /** Why Mark connected is off, as a reason code, or null when it is on. */
  cannotConnectReason: z.enum(["NO_INBOX_MODULE", "NO_NUMBER_LIMIT", "NOT_SEEN"]).nullable(),
});
export type ConsoleOrganizationWhatsapp = z.infer<typeof consoleOrganizationWhatsapp>;

export const setWhatsappCapsInput = z.strictObject({
  organizationId: recordId,
  marketingCapMonth: z.int().min(0).max(100_000),
  templateCapDay: z.int().min(0).max(100_000),
});
export type SetWhatsappCapsInput = z.infer<typeof setWhatsappCapsInput>;

/** The block super admins paste into MSG91's panel (spec 3.5). */
export const whatsappWebhookSettings = z.object({
  url: z.string(),
  headerName: z.string(),
  headerValue: z.string(),
});
export type WhatsappWebhookSettings = z.infer<typeof whatsappWebhookSettings>;
