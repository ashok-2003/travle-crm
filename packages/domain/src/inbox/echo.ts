// A message the agency sent from the WhatsApp Business App (spec 4.6 E1): stored as ours with no sender, it counts as a reply
// (the chat no longer waits, and the person's open lead has its first reply) and never opens or reopens the window. Its file is
// copied as a customer's is. A chat that starts with an echo is linked to the person if the number is known and never makes a
// lead. MSG91 also echoes our own sends (with no contentType): one only gives our send its wamid, found by its request id or
// else by its words (a file by its kind) in the chat, and is never stored, since a phone message would tell the AI a person is
// answering. MSG91's answer to a send has given no request id live, so the words are what find it.
import { toE164 } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { ParsedMessage } from "@travel-crm/integrations/whatsapp";
import { recordWhatsAppFirstReply } from "../crm/index.js";
import type { ConnectionRow } from "./connection-row.js";
import type { InboxDependencies } from "./dependencies.js";
import { lockConversation } from "./inbound.js";
import { queueMediaCopy } from "./media.js";
import { messageColumns } from "./messages.js";
import { GIVE_UP_MS } from "./statuses.js";

/** How far back an echo of our own send looks for the send it repeats. */
const OWN_ECHO_WINDOW_MS = 10 * 60_000;

const squeezed = (text: string | null) => (text === null ? null : text.replace(/\s+/g, " ").trim() || null);

/**
 * Our send this echo repeats: the one with its request id, else (an echo of ours) the oldest in the chat with no wamid yet,
 * sent in the last ten minutes, with the same words, or of the same kind when the echo has none.
 */
async function ownSendOf(
  tx: OrgTx,
  conversationId: string,
  message: ParsedMessage & { requestId: string | null; ourSend: boolean },
  now: Date,
): Promise<string | null> {
  if (message.requestId !== null) {
    const byRequest = await tx.whatsappMessage.findFirst({
      where: { conversationId, requestId: message.requestId },
      select: { id: true },
    });
    if (byRequest !== null) return byRequest.id;
  }
  if (!message.ourSend) return null;
  const at = message.occurredAt ?? now;
  const candidates = await tx.whatsappMessage.findMany({
    where: {
      conversationId,
      direction: "out",
      origin: { not: "staff_phone" },
      wamid: null,
      occurredAt: { gte: new Date(at.getTime() - OWN_ECHO_WINDOW_MS) },
    },
    orderBy: { occurredAt: "asc" },
    select: { id: true, body: true, caption: true, kind: true },
  });
  const words = squeezed(message.text ?? message.caption);
  const match = candidates.find((row) =>
    words === null ? row.kind === message.kind : squeezed(row.body ?? row.caption) === words,
  );
  return match?.id ?? null;
}

export async function receiveEcho(
  dependencies: InboxDependencies,
  organizationId: string,
  connection: ConnectionRow,
  message: ParsedMessage & { requestId: string | null; ourSend: boolean },
  now: Date,
): Promise<void> {
  const phoneE164 = toE164(message.customerNumber);
  if (phoneE164 === null) return;
  const copy = await dependencies.db.forOrg(organizationId, async (tx) => {
    const conversation = await lockConversation(tx, connection.id, phoneE164);
    if (message.ourSend || message.requestId !== null) {
      const own = await ownSendOf(tx, conversation.id, message, now);
      if (own !== null) {
        await tx.whatsappMessage.updateMany({ where: { id: own, wamid: null }, data: { wamid: message.wamid } });
        return null;
      }
    }
    if (message.ourSend) {
      // A send of ours still waiting for MSG91's answer: the echo is tried again, as an early report is. Past two minutes,
      // or with nothing of ours to match, it is dropped: never a phone message.
      const waiting = await tx.whatsappMessage.findFirst({
        where: { conversationId: conversation.id, status: "sending", origin: { not: "staff_phone" } },
        select: { id: true },
      });
      if (waiting !== null && now.getTime() - (message.occurredAt ?? now).getTime() <= GIVE_UP_MS) {
        throw ownMessage(new Error("A WhatsApp echo arrived before its send was saved"));
      }
      return null;
    }
    const columns = messageColumns(message, now);
    const stored = await tx.whatsappMessage.createManyAndReturn({
      data: [
        {
          ...columns,
          conversationId: conversation.id,
          direction: "out",
          origin: "staff_phone",
          status: "sent",
          sentAt: columns.occurredAt,
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    const row = stored[0];
    if (row === undefined) return null;
    const person =
      conversation.personId ?? (await tx.person.findFirst({ where: { phoneE164 }, select: { id: true } }))?.id ?? null;
    await tx.whatsappConversation.update({
      where: { id: conversation.id },
      data: {
        personId: person,
        needsReply: false,
        ...(conversation.lastMessageAt === null || columns.occurredAt.getTime() >= conversation.lastMessageAt.getTime()
          ? { lastMessageAt: columns.occurredAt, lastMessageId: row.id }
          : {}),
      },
    });
    if (person !== null) await recordWhatsAppFirstReply(tx, person, columns.occurredAt);
    await tx.whatsappConnection.update({ where: { id: connection.id }, data: { lastEventAt: now } });
    return columns.mediaState === "pending" ? row.id : null;
  });
  if (copy !== null) await queueMediaCopy(dependencies, organizationId, copy);
}
