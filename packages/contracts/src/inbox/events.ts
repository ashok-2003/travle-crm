// The payloads of the WhatsApp events and jobs (ADR 0009, 0035): ids only, never a number, a name or a word of a message.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

/** whatsapp.connection-changed: the number's route row is to be written or removed. */
export const whatsappConnectionChangedEvent = z.strictObject({ connectionId: recordId });
export type WhatsappConnectionChangedEvent = z.infer<typeof whatsappConnectionChangedEvent>;

/** whatsapp.message-received: a customer message landed in a chat that already has a lead, for the owner's notice (4.8). */
export const whatsappMessageReceivedEvent = z.strictObject({ conversationId: recordId, messageId: recordId });
export type WhatsappMessageReceivedEvent = z.infer<typeof whatsappMessageReceivedEvent>;

/** whatsapp.past-customer-wrote: a person whose leads are all closed wrote; the chat waits for Start a new lead (Q2). */
export const whatsappPastCustomerWroteEvent = z.strictObject({ conversationId: recordId, messageId: recordId });
export type WhatsappPastCustomerWroteEvent = z.infer<typeof whatsappPastCustomerWroteEvent>;

/** The whatsapp.copy-media job: copy one inbound file into our storage. */
export const whatsappCopyMediaJob = z.strictObject({ organizationId: recordId, messageId: recordId });
export type WhatsappCopyMediaJob = z.infer<typeof whatsappCopyMediaJob>;

/** whatsapp.message-queued: a staff reply is waiting in the outbox for the worker to send. */
export const whatsappMessageQueuedEvent = z.strictObject({ conversationId: recordId, messageId: recordId });
export type WhatsappMessageQueuedEvent = z.infer<typeof whatsappMessageQueuedEvent>;

/** whatsapp.customer-wrote: every new message a customer writes (not a reaction, not a blocked contact's), for the automatic answers. */
export const whatsappCustomerWroteEvent = z.strictObject({
  conversationId: recordId,
  messageId: recordId,
  /** The number had never written before. */
  firstEver: z.boolean(),
});
export type WhatsappCustomerWroteEvent = z.infer<typeof whatsappCustomerWroteEvent>;

/**
 * whatsapp.text-received: a customer wrote words (not a reaction, not a blocked contact's, not STOP), for every agency, whatever
 * automation it has set up: what reads the words for itself (hot-lead buying words, the AI's guess) listens here, so that
 * none of them makes the automatic answers run for an agency that has none.
 */
export const whatsappTextReceivedEvent = z.strictObject({ conversationId: recordId, messageId: recordId });
export type WhatsappTextReceivedEvent = z.infer<typeof whatsappTextReceivedEvent>;

/** whatsapp.broadcast-ready: a broadcast has recipients waiting (it was created, resumed, or has more after a batch or a day). */
export const whatsappBroadcastReadyEvent = z.strictObject({ broadcastId: recordId });
export type WhatsappBroadcastReadyEvent = z.infer<typeof whatsappBroadcastReadyEvent>;
