// Replying (spec 4.4 S1-S4): a staff reply is a message row in `queued`, written in one transaction with the event that wakes the
// worker (the outbox), after the checks: the chat is the member's to see, the number is connected and not paused, and the 24-hour
// window is open. The browser's token makes a double tap one message. A file is uploaded to storage first (never through the api)
// and named by a second call. Try again puts a failed message back in the queue; Mark as answered clears the chat's waiting mark.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import {
  MAX_WHATSAPP_SEND_BYTES,
  mediaUploadSlot,
  sentMessage,
  whatsappMessageStatus,
  whatsappSendContentTypes,
  type MediaUploadSlot,
  type RequestMediaUploadInput,
  type SendMediaInput,
  type SendMessageInput,
  type SentMessage,
} from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, newUuidV7 } from "../kernel/index.js";
import { liveConnection } from "./connection-row.js";
import { settleNeedsReply } from "./needs-reply.js";
import { visibleConversation } from "./views.js";
import { windowIsOpen } from "./window.js";

/** The event the worker's sender listens for. */
export const MESSAGE_QUEUED_EVENT = "whatsapp.message-queued";

/** What replying needs from the process: whether WhatsApp is on here (the three settings). */
export interface ReplyContext {
  whatsappConfigured: boolean;
}

/** The chat as a reply sees it, once every check has passed. */
interface SendableChat {
  id: string;
  personId: string | null;
}

/** The checks every reply makes before anything is written. The window is checked last: the others are never a matter of time. */
export async function sendableChat(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
  context: ReplyContext,
  now: Date,
  { window = true }: { window?: boolean } = {},
): Promise<SendableChat & { phoneE164: string; lastInboundAt: Date | null; connectionId: string }> {
  const chat = await visibleConversation(tx, access, conversationId);
  const connection = await liveConnection(tx);
  if (
    !context.whatsappConfigured ||
    connection === null ||
    connection.status === "setup" ||
    connection.mode === "demo" ||
    connection.id !== chat.connectionId ||
    chat.state === "erased"
  ) {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
  }
  if (connection.status === "paused") {
    throw new DomainError("CONFLICT", "WHATSAPP_PAUSED", "WhatsApp is paused for this agency");
  }
  if (window && !windowIsOpen(chat.lastInboundAt, now)) {
    throw new DomainError("CONFLICT", "WINDOW_CLOSED", "The 24-hour window for free text is closed");
  }
  return {
    id: chat.id,
    personId: chat.personId,
    phoneE164: chat.phoneE164,
    lastInboundAt: chat.lastInboundAt,
    connectionId: connection.id,
  };
}

/** Holds the chat's row until the transaction ends, so a reply and an inbound message do not overwrite each other's marks. */
async function lockChat(tx: OrgTx, conversationId: string): Promise<{ lastMessageAt: Date | null }> {
  const [row] = await tx.$queryRaw<{ lastMessageAt: Date | null }[]>`
    SELECT last_message_at AS "lastMessageAt" FROM whatsapp_conversation WHERE id = ${conversationId}::uuid FOR UPDATE`;
  if (row === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  return row;
}

/** The chat shows this message last, unless a later one already does (messages may arrive out of order, I5). */
export async function showAsLast(tx: OrgTx, conversationId: string, messageId: string, at: Date): Promise<void> {
  const chat = await lockChat(tx, conversationId);
  await tx.whatsappConversation.update({
    where: { id: conversationId },
    data:
      chat.lastMessageAt === null || at.getTime() >= chat.lastMessageAt.getTime()
        ? { lastMessageAt: at, lastMessageId: messageId }
        : {},
  });
  await settleNeedsReply(tx, conversationId);
}

export const sentOf = (row: { id: string; status: string }): SentMessage =>
  sentMessage.parse({ messageId: row.id, status: whatsappMessageStatus.catch("queued").parse(row.status) });

/** The message already made for this token in this chat, if there is one: a double tap or a retried request. */
export async function earlierSend(tx: OrgTx, conversationId: string, clientToken: string) {
  const row = await tx.whatsappMessage.findFirst({
    where: { clientToken },
    select: { id: true, status: true, conversationId: true },
  });
  if (row === null) return null;
  if (row.conversationId !== conversationId) {
    throw new DomainError("CONFLICT", "ATTACHMENT_ID_IN_USE", "This send was made already");
  }
  return row;
}

/** Queues a text reply. */
export async function queueText(
  tx: OrgTx,
  access: MemberAccess,
  input: SendMessageInput,
  context: ReplyContext,
  now: Date,
): Promise<SentMessage> {
  const chat = await visibleConversation(tx, access, input.conversationId);
  const earlier = await earlierSend(tx, chat.id, input.clientToken);
  if (earlier !== null) return sentOf(earlier);
  await sendableChat(tx, access, input.conversationId, context, now);
  const [row] = await tx.whatsappMessage.createManyAndReturn({
    data: [
      {
        conversationId: chat.id,
        direction: "out",
        origin: "staff_crm",
        kind: "text",
        body: input.text,
        status: "queued",
        sentBy: access.userId,
        clientToken: input.clientToken,
        occurredAt: now,
      },
    ],
    skipDuplicates: true,
    select: { id: true, status: true },
  });
  // A concurrent twin won the unique token: the message is theirs, and the event was published with it.
  if (row === undefined) {
    const twin = await earlierSend(tx, chat.id, input.clientToken);
    if (twin === null) throw new DomainError("CONFLICT", "ATTACHMENT_ID_IN_USE", "This send was made already");
    return sentOf(twin);
  }
  await showAsLast(tx, chat.id, row.id, now);
  await publishEvent(tx, { type: MESSAGE_QUEUED_EVENT, payload: { conversationId: chat.id, messageId: row.id } });
  return sentOf(row);
}

/** The kind of message a file is sent as. */
const kindOf = (contentType: string) =>
  contentType.startsWith("image/")
    ? "image"
    : contentType.startsWith("video/")
      ? "video"
      : contentType.startsWith("audio/")
        ? "audio"
        : "document";

/** The kinds and size of file WhatsApp takes from here; the api's schema says the same, the domain does not rely on it. */
function assertSendable(contentType: string, sizeBytes: number): void {
  if (!(whatsappSendContentTypes as readonly string[]).includes(contentType)) {
    throw new DomainError("VALIDATION", "ATTACHMENT_TYPE", "WhatsApp does not take this kind of file");
  }
  if (sizeBytes > MAX_WHATSAPP_SEND_BYTES) {
    throw new DomainError("VALIDATION", "ATTACHMENT_TOO_BIG", "The file is over the 16 MB WhatsApp allows here");
  }
}

export interface MediaDependencies {
  db: Database;
  files: Files;
}

/** Step one of sending a file: checks the chat, then gives the browser a place to put the file. */
export async function requestMediaUpload(
  dependencies: MediaDependencies,
  access: MemberAccess,
  input: RequestMediaUploadInput,
  context: ReplyContext,
  now: Date,
): Promise<MediaUploadSlot> {
  assertSendable(input.contentType, input.sizeBytes);
  await dependencies.db.forOrg(access.organizationId, (tx) =>
    sendableChat(tx, access, input.conversationId, context, now),
  );
  // The file hangs on the message-to-be: its id is made here and named again by sendMedia.
  const messageId = newUuidV7();
  const { attachment, upload } = await dependencies.files.requestUpload(access, {
    recordType: WHATSAPP_RECORD_TYPE,
    recordId: messageId,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  return mediaUploadSlot.parse({
    messageId,
    attachmentId: attachment.id,
    upload: { ...upload, expiresAt: upload.expiresAt.toISOString() },
  });
}

/** Step two: the uploaded file becomes a queued message, with its caption. */
export async function queueMedia(
  dependencies: MediaDependencies,
  access: MemberAccess,
  input: SendMediaInput,
  context: ReplyContext,
  now: Date,
): Promise<SentMessage> {
  const { db, files } = dependencies;
  const earlier = await db.forOrg(access.organizationId, async (tx) => {
    const chat = await visibleConversation(tx, access, input.conversationId);
    return earlierSend(tx, chat.id, input.clientToken);
  });
  if (earlier !== null) return sentOf(earlier);
  // Storage must hold the promised bytes before the message exists; harmless to repeat. The files module names the record, so a
  // file of another message is "not found".
  const file = await files.confirmUpload(access, {
    recordType: WHATSAPP_RECORD_TYPE,
    recordId: input.messageId,
    attachmentId: input.attachmentId,
  });
  assertSendable(file.contentType, file.sizeBytes);
  return db.forOrg(access.organizationId, async (tx) => {
    const chat = await sendableChat(tx, access, input.conversationId, context, now);
    const [row] = await tx.whatsappMessage.createManyAndReturn({
      data: [
        {
          id: input.messageId,
          conversationId: chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: kindOf(file.contentType),
          caption: input.caption ?? null,
          fileName: file.fileName,
          status: "queued",
          sentBy: access.userId,
          clientToken: input.clientToken,
          occurredAt: now,
          mediaState: "stored",
        },
      ],
      skipDuplicates: true,
      select: { id: true, status: true },
    });
    if (row === undefined) {
      const twin = await earlierSend(tx, chat.id, input.clientToken);
      if (twin === null) throw new DomainError("CONFLICT", "ATTACHMENT_ID_IN_USE", "This file was sent already");
      return sentOf(twin);
    }
    await showAsLast(tx, chat.id, row.id, now);
    await publishEvent(tx, { type: MESSAGE_QUEUED_EVENT, payload: { conversationId: chat.id, messageId: row.id } });
    return sentOf(row);
  });
}

/** Mark as answered (spec 5): the chat stops waiting for a reply, for an answer given another way (a call). */
export async function markAnswered(tx: OrgTx, access: MemberAccess, conversationId: string): Promise<void> {
  const chat = await visibleConversation(tx, access, conversationId);
  await tx.whatsappConversation.update({ where: { id: chat.id }, data: { needsReply: false } });
}
