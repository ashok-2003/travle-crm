// Discard a message that did not go (audit 11): the failed bubble is taken out of the chat, for good, when a person decides
// it should not be tried again. The row stays (as `superseded`, the status that hides a message); only a message of ours that
// failed can be discarded, and the audit log records who did it.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { visibleConversation } from "./views.js";

export async function discardFailedMessage(tx: OrgTx, access: MemberAccess, messageId: string): Promise<void> {
  const message = await tx.whatsappMessage.findUnique({
    where: { id: messageId },
    select: { id: true, status: true, conversationId: true, direction: true, origin: true },
  });
  if (message?.direction !== "out" || message.origin !== "staff_crm") {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  }
  await visibleConversation(tx, access, message.conversationId);
  if (message.status === "superseded") return;
  if (message.status !== "failed") {
    throw new DomainError("CONFLICT", "NOT_FAILED", "Only a message that was not sent can be discarded");
  }
  await tx.whatsappMessage.update({ where: { id: message.id }, data: { status: "superseded" } });
  await recordAudit(tx, access, {
    action: "inbox.message-discarded",
    entityType: "whatsapp_conversation",
    entityId: message.conversationId,
    after: { messageId: message.id },
  });
}
