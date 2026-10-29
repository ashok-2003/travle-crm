// A reply the system writes on the team's behalf (sales inbox spec 6): a scheduled message when its time comes, and the
// automatic answers (away, welcome, keyword). It passes the same checks as a reply typed now (the number connected and
// not paused, the 24-hour window open) and one more: nobody who withdrew their WhatsApp consent is written to. It goes
// through the same outbox; an automatic answer is written as "automation" and leaves the chat waiting for a person's
// reply. The client token makes a repeat (a job run twice) one message.
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import { liveConnection } from "./connection-row.js";
import { MESSAGE_QUEUED_EVENT, showAsLast } from "./outbox.js";
import { chatOptedOut } from "./whatsapp-consent.js";
import { windowIsOpen } from "./window.js";

export type SystemSendResult = { ok: true; messageId: string } | { ok: false; code: string };

export async function queueSystemText(
  tx: OrgTx,
  input: {
    conversationId: string;
    body: string;
    /** The member it is sent for (a scheduled message's writer), or null for an automatic answer. */
    sentBy: string | null;
    /** "staff_crm" for a person's message sent later, "automation" for an answer the system wrote. */
    origin: "staff_crm" | "automation";
    clientToken: string;
    /** True for a person's reply sent later: the chat stops waiting. False for an automatic answer. */
    answers: boolean;
    /**
     * A file already stored on the message to be (a trip's photo copied to it): the message is that file, with `body` as
     * its caption. Its id is the message's, which the file was stored under.
     */
    media?: { messageId: string; kind: "image" | "video" | "audio" | "document"; fileName: string };
  },
  now: Date,
): Promise<SystemSendResult> {
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, connectionId: true, personId: true, state: true, hidden: true, lastInboundAt: true },
  });
  if (chat?.state !== "open" || chat.hidden) return { ok: false, code: "not_connected" };
  const connection = await liveConnection(tx);
  if (connection?.id !== chat.connectionId || connection.mode === "demo") return { ok: false, code: "not_connected" };
  if (connection.status === "paused") return { ok: false, code: "paused" };
  if (connection.status === "setup") return { ok: false, code: "not_connected" };
  if (!windowIsOpen(chat.lastInboundAt, now)) return { ok: false, code: "window_closed" };
  if (await chatOptedOut(tx, chat)) return { ok: false, code: "opted_out" };
  const [row] = await tx.whatsappMessage.createManyAndReturn({
    data: [
      {
        conversationId: chat.id,
        direction: "out",
        origin: input.origin,
        ...(input.media === undefined
          ? { kind: "text", body: input.body }
          : {
              id: input.media.messageId,
              kind: input.media.kind,
              caption: input.body === "" ? null : input.body,
              fileName: input.media.fileName,
              mediaState: "stored",
            }),
        status: "queued",
        sentBy: input.sentBy,
        clientToken: input.clientToken,
        occurredAt: now,
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  });
  if (row === undefined) {
    const twin = await tx.whatsappMessage.findFirst({
      where: { clientToken: input.clientToken },
      select: { id: true },
    });
    return twin === null ? { ok: false, code: "other" } : { ok: true, messageId: twin.id };
  }
  if (input.answers) {
    await showAsLast(tx, chat.id, row.id, now);
  } else {
    // Shown last, but the customer still waits for a person: the waiting mark stays.
    await tx.whatsappConversation.update({
      where: { id: chat.id },
      data: { lastMessageAt: now, lastMessageId: row.id },
    });
  }
  await publishEvent(tx, { type: MESSAGE_QUEUED_EVENT, payload: { conversationId: chat.id, messageId: row.id } });
  return { ok: true, messageId: row.id };
}
