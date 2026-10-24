// An erased customer's WhatsApp (spec 10): every message of the person's chats has its words, caption, file name, place, link and
// template values emptied and its kind kept; its media files go through the files module's own deletion (the bytes are queued
// for deletion in the same transaction); its wamid stays (a wamid is not personal data, and keeping it stops a late retry from
// making the message again). The chat loses its person, its profile name and its number (replaced by erased:<uuid>) and
// becomes erased, so the same person writing again is a new chat and, per crm's rule, a new enquiry. Runs in the erasure's
// platform transaction, naming the organization.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { randomUUID } from "node:crypto";
import { deleteRecordFiles } from "../files/index.js";
import { mediaKinds } from "./messages.js";

export interface WhatsAppWithdrawn {
  conversations: number;
  messages: number;
  files: number;
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
  if (chats.length === 0) return { conversations: 0, messages: 0, files: 0 };
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
  return { conversations: chats.length, messages: emptied.count, files };
}
