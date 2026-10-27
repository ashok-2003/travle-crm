// An erased customer's WhatsApp (spec 10): every message of the person's chats has its words, caption, file name, place, link and
// template values emptied and its kind kept; its media files go through the files module's own deletion (the bytes are queued
// for deletion in the same transaction); its wamid stays (a wamid is not personal data, and keeping it stops a late retry from
// making the message again). The chat loses its person, its profile name and its number (replaced by erased:<uuid>) and
// becomes erased, so the same person writing again is a new chat and, per crm's rule, a new enquiry. What the sales inbox
// keeps about the chat goes too: the scheduled messages (their words), the tags on it, its place in any broadcast, every member's read mark, and the
// notices that name it. The automatic answers written to the person are messages, so they are emptied with the rest; the notes
// on their lead are crm's, erased with the lead. Runs in the erasure's platform transaction, naming the organization.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { randomUUID } from "node:crypto";
import { deleteRecordFiles } from "../files/index.js";
import { forgetRecordNotifications } from "../notifications/index.js";
import { mediaKinds } from "./messages.js";

export interface WhatsAppWithdrawn {
  conversations: number;
  messages: number;
  files: number;
  /** Scheduled messages, tags on the chats and read marks removed, and notices forgotten: counts for the platform log. */
  inboxRows: number;
}

export async function withdrawWhatsApp(
  tx: OrgTx,
  input: {
    organizationId: string;
    personId: string;
    /** Their numbers: a chat stored with no person is found by them. */ phones?: readonly string[];
    now: Date;
  },
): Promise<WhatsAppWithdrawn> {
  const { organizationId, personId, now } = input;
  const chats = await tx.whatsappConversation.findMany({
    where: {
      organizationId,
      OR: [
        { personId },
        ...((input.phones?.length ?? 0) > 0 ? [{ phoneE164: { in: [...(input.phones ?? [])] } }] : []),
      ],
    },
    select: { id: true },
  });
  if (chats.length === 0) return { conversations: 0, messages: 0, files: 0, inboxRows: 0 };
  const conversationIds = chats.map((chat) => chat.id);
  const withFiles = await tx.whatsappMessage.findMany({
    where: { organizationId, conversationId: { in: conversationIds }, kind: { in: [...mediaKinds] } },
    select: { id: true },
  });
  let files = 0;
  for (const message of withFiles) {
    files += await deleteRecordFiles(
      tx,
      { organizationId, recordType: WHATSAPP_RECORD_TYPE, recordId: message.id },
      now,
    );
  }
  const emptied = await tx.whatsappMessage.updateMany({
    where: { organizationId, conversationId: { in: conversationIds } },
    data: {
      body: null,
      caption: null,
      fileName: null,
      latitude: null,
      longitude: null,
      mediaUrl: null,
      reaction: null,
      quotedWamid: null,
      templateParams: [],
    },
  });
  const inChats = { organizationId, conversationId: { in: conversationIds } };
  let inboxRows = (await tx.whatsappBroadcastRecipient.deleteMany({ where: inChats })).count;
  inboxRows += (await tx.scheduledMessage.deleteMany({ where: inChats })).count;
  inboxRows += (await tx.conversationTag.deleteMany({ where: inChats })).count;
  inboxRows += (await tx.conversationRead.deleteMany({ where: inChats })).count;
  // Which trips went to the person's chats: their sends go with them.
  inboxRows += (await tx.tripKitSend.deleteMany({ where: inChats })).count;
  // What the AI agent remembers of the chats, and the insight on the person's leads (their wishes, in words).
  inboxRows += (await tx.aiChat.deleteMany({ where: inChats })).count;
  const personIds = (
    await tx.whatsappConversation.findMany({
      where: { organizationId, id: { in: conversationIds }, personId: { not: null } },
      select: { personId: true },
    })
  ).flatMap((chat) => (chat.personId === null ? [] : [chat.personId]));
  inboxRows += (await tx.leadAiInsight.deleteMany({ where: { organizationId, lead: { personId: { in: personIds } } } }))
    .count;
  // A notice about a chat (a mention, a failed send, a waking snooze) carries the customer's name and links to the chat.
  for (const id of conversationIds) {
    inboxRows += await forgetRecordNotifications(tx, { organizationId, recordId: id, sourceEventIds: [] });
  }
  for (const id of conversationIds) {
    await tx.whatsappConversation.update({
      where: { id },
      data: {
        phoneE164: `erased:${randomUUID()}`,
        personId: null,
        profileName: null,
        state: "erased",
        needsReply: false,
      },
    });
  }
  return { conversations: chats.length, messages: emptied.count, files, inboxRows };
}
