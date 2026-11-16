// The AI agents' messages to a customer, in the turn's own transaction: each goes through the outbox with a token made
// from the turn's, so a repeat of the turn sends none twice, and a refusal throws so the whole turn rolls back.
import { WHATSAPP_RECORD_TYPE, type AttachmentRefInput } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Files } from "../files/index.js";
import { kindOf, queueSystemText } from "../inbox/index.js";
import { uuidFromKey } from "../jobs/index.js";
import { DomainError, systemActor } from "../kernel/index.js";

/** The chat a turn writes to, and whether its messages answer the customer (not when a person must take over). */
export interface AiMessageTarget {
  organizationId: string;
  conversationId: string;
  now: Date;
  answers: boolean;
}

/** Why a send was refused, as the sentence the web app already has for it. */
const refusals: Record<string, string> = {
  not_connected: "WHATSAPP_NOT_CONNECTED",
  paused: "WHATSAPP_PAUSED",
  window_closed: "WINDOW_CLOSED",
};

/** Queues one message of the AI's (a file when `media` names one, `body` its caption) and returns its id. */
export async function sendAiText(
  tx: OrgTx,
  target: AiMessageTarget,
  clientToken: string,
  body: string,
  kind: "reply" | "file" | "qr" | "payment",
  media?: { messageId: string; kind: "image" | "video" | "audio" | "document"; fileName: string },
): Promise<string> {
  const sent = await queueSystemText(
    tx,
    {
      conversationId: target.conversationId,
      body,
      sentBy: null,
      origin: "automation",
      clientToken,
      // Answered by the AI: the chat no longer waits, unless it is handed to a person.
      answers: target.answers,
      ...(media === undefined ? {} : { media }),
    },
    target.now,
  );
  if (!sent.ok) {
    throw new DomainError("CONFLICT", refusals[sent.code] ?? "REPLY_NOT_SENT", "The reply could not be sent");
  }
  await recordAudit(tx, systemActor(target.organizationId), {
    action: "ai.message-sent",
    entityType: "whatsapp_message",
    entityId: sent.messageId,
    after: { kind, length: body.length },
  });
  return sent.messageId;
}

/** A stored file copied onto the message that sends it, the copy named by the message's token so a retry finds it. */
export async function sendAiFile(
  tx: OrgTx,
  store: { files: Files; storageLimitBytes: number | null },
  target: AiMessageTarget,
  clientToken: string,
  from: AttachmentRefInput,
  kind: "file" | "qr",
): Promise<string> {
  const messageId = uuidFromKey(clientToken);
  const copy = await store.files.copyFileIn(
    tx,
    systemActor(target.organizationId),
    from,
    { recordType: WHATSAPP_RECORD_TYPE, recordId: messageId },
    store.storageLimitBytes,
  );
  return sendAiText(tx, target, clientToken, "", kind, {
    messageId,
    kind: kindOf(copy.contentType),
    fileName: copy.fileName,
  });
}
