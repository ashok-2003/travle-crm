// The queued message the sender works on, with everything sending it needs read in one go (spec 4.4 S1-S5).
import type { OrgTx } from "@travel-crm/db";

export interface Queued {
  id: string;
  kind: string;
  body: string | null;
  caption: string | null;
  fileName: string | null;
  template: { name: string; language: string; category: string } | null;
  templateParams: string[];
  /** The WhatsApp id of the message our reply quotes; null with no quote, or when that message has none yet. */
  replyTo: string | null;
  /** The reply quotes a message (so a send refused for the quote may go again without it). */
  quotes: boolean;
  /** When it was queued (or last tried again by a person). */
  queuedAt: Date;
  sentBy: string | null;
  /** "automation" for an answer the system wrote. */
  origin: string;
  conversationId: string;
  phoneE164: string;
  personId: string | null;
  lastInboundAt: Date | null;
  integratedNumber: string;
  connectionStatus: string;
  connectionId: string;
}

/** The queued message with what sending it needs, or null when it is not (or no longer) waiting. */
export async function queuedMessage(tx: OrgTx, messageId: string): Promise<Queued | null> {
  const message = await tx.whatsappMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      kind: true,
      body: true,
      caption: true,
      fileName: true,
      occurredAt: true,
      sentBy: true,
      templateParams: true,
      quotedMessageId: true,
      quotedMessage: { select: { wamid: true } },
      template: { select: { name: true, language: true, category: true } },
      status: true,
      direction: true,
      origin: true,
      conversation: {
        select: {
          id: true,
          phoneE164: true,
          personId: true,
          lastInboundAt: true,
          connection: { select: { id: true, integratedNumber: true, status: true } },
        },
      },
    },
  });
  if (message?.status !== "queued" || message.direction !== "out") return null;
  if (message.origin !== "staff_crm" && message.origin !== "automation") return null;
  const { conversation } = message;
  return {
    id: message.id,
    kind: message.kind,
    body: message.body,
    caption: message.caption,
    fileName: message.fileName,
    template: message.template,
    templateParams: message.templateParams,
    replyTo: message.quotedMessage?.wamid ?? null,
    quotes: message.quotedMessageId !== null,
    queuedAt: message.occurredAt,
    sentBy: message.sentBy,
    origin: message.origin,
    conversationId: conversation.id,
    phoneE164: conversation.phoneE164,
    personId: conversation.personId,
    lastInboundAt: conversation.lastInboundAt,
    integratedNumber: conversation.connection.integratedNumber,
    connectionStatus: conversation.connection.status,
    connectionId: conversation.connection.id,
  };
}
