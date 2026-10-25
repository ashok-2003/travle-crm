// A reply the system writes on the team's behalf (sales inbox spec 6): a scheduled message when its time comes, and the
// automatic answers (away, welcome, keyword). It passes the same checks as a reply typed now (the number connected and
// not paused, the 24-hour window open) and goes through the same outbox; an automatic answer leaves the chat waiting
// for a person's reply. The client token makes a repeat (a job run twice) one message.
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import { liveConnection } from "./connection-row.js";
import { MESSAGE_QUEUED_EVENT, showAsLast } from "./outbox.js";
import { windowIsOpen } from "./window.js";

export type SystemSendResult = { ok: true; messageId: string } | { ok: false; code: string };

export async function queueSystemText(
  tx: OrgTx,
  input: {
    conversationId: string;
    body: string;
    /** The member it is sent for (a scheduled message's writer), or null for an automatic answer. */
    sentBy: string | null;
    clientToken: string;
    /** True for a person's reply sent later: the chat stops waiting. False for an automatic answer. */
    answers: boolean;
  },
  now: Date,
): Promise<SystemSendResult> {
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, connectionId: true, state: true, hidden: true, lastInboundAt: true },
  });
  if (chat?.state !== "open" || chat.hidden) return { ok: false, code: "not_connected" };
  const connection = await liveConnection(tx);
  if (connection?.id !== chat.connectionId || connection.mode === "demo") return { ok: false, code: "not_connected" };
  if (connection.status === "paused") return { ok: false, code: "paused" };
  if (connection.status === "setup") return { ok: false, code: "not_connected" };
  if (!windowIsOpen(chat.lastInboundAt, now)) return { ok: false, code: "window_closed" };
  const [row] = await tx.whatsappMessage.createManyAndReturn({
    data: [
      {
        conversationId: chat.id,
        direction: "out",
        origin: "staff_crm",
        kind: "text",
        body: input.body,
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
