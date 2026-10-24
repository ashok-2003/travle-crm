// A message the agency sent from the WhatsApp Business App (spec 4.6 E1): stored as ours with no sender, it counts as a reply
// (the chat no longer waits, and the person's open lead has its first reply) and never opens or reopens the window.
// A chat that starts with an echo is linked to the person if the number is known and never makes a lead.
// SPIKE(S2): whether MSG91 delivers echoes at all, and how, is not confirmed.
import { toE164 } from "@travel-crm/contracts/kernel";
import type { ParsedMessage } from "@travel-crm/integrations/whatsapp";
import { recordWhatsAppFirstReply } from "../crm/index.js";
import type { ConnectionRow } from "./connection-row.js";
import type { InboxDependencies } from "./dependencies.js";
import { lockConversation } from "./inbound.js";
import { messageColumns } from "./messages.js";

export async function receiveEcho(
  dependencies: InboxDependencies,
  organizationId: string,
  connection: ConnectionRow,
  message: ParsedMessage,
  now: Date,
): Promise<void> {
  const phoneE164 = toE164(message.customerNumber);
  if (phoneE164 === null) return;
  await dependencies.db.forOrg(organizationId, async (tx) => {
    const conversation = await lockConversation(tx, connection.id, phoneE164);
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
          mediaState: "none",
          mediaUrl: null,
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    const row = stored[0];
    if (row === undefined) return;
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
  });
}
