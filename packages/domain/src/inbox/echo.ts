// A message the agency sent from the WhatsApp Business App (spec 4.6 E1): stored as ours with no sender, it counts as a reply
// (the chat no longer waits, and the person's open lead has its first reply) and never opens or reopens the window. Its file is
// copied as a customer's is. A chat that starts with an echo is linked to the person if the number is known and never makes a
// lead. MSG91 also echoes some of our own sends: one whose request id is a send of ours in the chat only gives that send its
// wamid, since a phone message would tell the AI a person is answering.
import { toE164 } from "@travel-crm/contracts/kernel";
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { ParsedMessage } from "@travel-crm/integrations/whatsapp";
import { recordWhatsAppFirstReply } from "../crm/index.js";
import type { ConnectionRow } from "./connection-row.js";
import type { InboxDependencies } from "./dependencies.js";
import { lockConversation } from "./inbound.js";
import { queueMediaCopy } from "./media.js";
import { messageColumns } from "./messages.js";
import { GIVE_UP_MS } from "./statuses.js";

export async function receiveEcho(
  dependencies: InboxDependencies,
  organizationId: string,
  connection: ConnectionRow,
  message: ParsedMessage & { requestId: string | null },
  now: Date,
): Promise<void> {
  const phoneE164 = toE164(message.customerNumber);
  if (phoneE164 === null) return;
  const copy = await dependencies.db.forOrg(organizationId, async (tx) => {
    const conversation = await lockConversation(tx, connection.id, phoneE164);
    if (message.requestId !== null) {
      // Only our own sends keep a request id.
      const own = await tx.whatsappMessage.findFirst({
        where: { conversationId: conversation.id, requestId: message.requestId },
        select: { id: true },
      });
      if (own !== null) {
        await tx.whatsappMessage.updateMany({ where: { id: own.id, wamid: null }, data: { wamid: message.wamid } });
        return null;
      }
      // A send of ours still waiting for MSG91's answer gets its request id with it: the echo is tried again, as an early
      // report is. After two minutes it is stored, so a person's own message is never lost.
      const waiting = await tx.whatsappMessage.findFirst({
        where: { conversationId: conversation.id, status: "sending" },
        select: { id: true },
      });
      if (waiting !== null && now.getTime() - (message.occurredAt ?? now).getTime() <= GIVE_UP_MS) {
        throw ownMessage(new Error("A WhatsApp echo arrived before its send was saved"));
      }
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
