// What a member does from a chat that is not reading it: Start a new lead for a past customer (Q2), and open a message's file.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { mediaLink, type MediaLink } from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { startLeadFromChat, type WhatsAppContactContext } from "../crm/index.js";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { visibleConversations } from "./scope.js";
import { visibleMessage } from "./views.js";

/** Start a new lead from a chat whose person has only closed leads; the lead is Returning and assigned by the agency's rules. */
export async function startLeadFromConversation(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
  context: WhatsAppContactContext,
  now: Date,
): Promise<{ leadId: string }> {
  const chat = await tx.whatsappConversation.findFirst({
    where: { AND: [{ id: conversationId, state: "open" }, visibleConversations(access)] },
    select: { personId: true },
  });
  if (chat === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (chat.personId === null) throw new DomainError("CONFLICT", "NO_PERSON_YET", "This number has no person yet");
  const { leadId } = await startLeadFromChat(tx, access, { personId: chat.personId }, context, now);
  await recordAudit(tx, access, {
    action: "whatsapp.lead-started-from-chat",
    entityType: "lead",
    entityId: leadId,
    after: { source: "whatsapp" },
  });
  return { leadId };
}

/** A short-lived link to a message's stored file, with the name and type to show it by. Sensitive files obey their rule. */
export async function mediaLinkOf(
  dependencies: { db: Database; files: Files },
  access: MemberAccess,
  messageId: string,
): Promise<MediaLink> {
  const message = await dependencies.db.forOrg(access.organizationId, (tx) => visibleMessage(tx, access, messageId));
  if (message.mediaState !== "stored") throw new DomainError("NOT_FOUND", "NOT_FOUND", "The file is not stored");
  const record = { recordType: WHATSAPP_RECORD_TYPE, recordId: messageId };
  const [file] = await dependencies.files.list(access, record);
  if (file === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "The file is not stored");
  const link = await dependencies.files.downloadLink(access, { ...record, attachmentId: file.id });
  return mediaLink.parse({ url: link.url, fileName: file.fileName, contentType: file.contentType });
}
