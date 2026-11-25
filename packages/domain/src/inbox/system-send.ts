// A reply the system writes on the team's behalf (sales inbox spec 6): a scheduled message when its time comes, and the
// automatic answers (away, welcome, keyword). It passes the same checks as a reply typed now (the chat's own number
// connected and not paused, the 24-hour window open) and one more: nobody who withdrew their WhatsApp consent is written
// to. It goes through the same outbox; an automatic answer is written as "automation" and leaves the chat waiting for a
// person's reply. The client token makes a repeat (a job run twice) one message.
import type { ChatList } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import type { WhatsAppButton } from "@travel-crm/integrations/whatsapp";
import { publishEvent } from "../jobs/index.js";
import { MESSAGE_QUEUED_EVENT, showAsLast } from "./outbox.js";
import { sendFrom } from "./send-from.js";
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
    /** A card: `body` goes with these reply buttons (1 to 3), sent by the outbox as one message. */
    buttons?: readonly WhatsAppButton[];
    /** A list: `body` goes with the button that opens these rows (1 to 10), kept in the same column as a card's buttons. */
    list?: ChatList;
  },
  now: Date,
): Promise<SystemSendResult> {
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, personId: true, state: true, hidden: true, lastInboundAt: true },
  });
  if (chat?.state !== "open" || chat.hidden) return { ok: false, code: "not_connected" };
  // The chat's own number or nothing; a disconnected one is "not_connected" here, as before (MN2).
  const from = await sendFrom(tx, { chat: chat.id });
  if (!from.ok) return { ok: false, code: from.code === "paused" ? "paused" : "not_connected" };
  if (!windowIsOpen(chat.lastInboundAt, now)) return { ok: false, code: "window_closed" };
  if (await chatOptedOut(tx, chat)) return { ok: false, code: "opted_out" };
  const [row] = await tx.whatsappMessage.createManyAndReturn({
    data: [
      {
        conversationId: chat.id,
        direction: "out",
        origin: input.origin,
        ...(input.media === undefined
          ? {
              kind: "text",
              body: input.body,
              ...(input.buttons === undefined
                ? {}
                : { buttons: input.buttons.map(({ id, title }) => ({ id, title })) }),
              ...(input.list === undefined
                ? {}
                : { buttons: { button: input.list.button, rows: input.list.rows.map((row) => ({ ...row })) } }),
            }
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
