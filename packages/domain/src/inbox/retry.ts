// Try again (spec 4.4 S2): a message that did not go is put back in the queue by a person, never by the worker.
import type { SentMessage } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { MESSAGE_QUEUED_EVENT, sendableChat, sentOf, showAsLast, type ReplyContext } from "./outbox.js";
import { assertTemplateAllowed } from "./template-send.js";
import { visibleConversation } from "./views.js";

/**
 * Try again on a message that did not go (S2): the same message goes back in the queue, in the window if it is still open. A
 * message already back in the queue, or on its way, is left alone, so a double tap sends once. The customer may already have the
 * first try (a timeout can hide it): that is why only a person asks for this, never the worker.
 */
export async function retryMessage(
  tx: OrgTx,
  access: MemberAccess,
  messageId: string,
  context: ReplyContext,
  now: Date,
): Promise<SentMessage> {
  const message = await tx.whatsappMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      status: true,
      conversationId: true,
      direction: true,
      origin: true,
      kind: true,
      templateId: true,
      templateParams: true,
    },
  });
  if (message?.direction !== "out" || message.origin !== "staff_crm") {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  }
  await visibleConversation(tx, access, message.conversationId);
  if (message.status === "queued" || message.status === "sending") return sentOf(message);
  if (message.status !== "failed") {
    throw new DomainError("CONFLICT", "NOT_FAILED", "Only a message that was not sent can be tried again");
  }
  const chat = await sendableChat(tx, access, message.conversationId, context, now, {
    window: message.kind !== "template",
  });
  // A template is checked as a first send is: approval, STOP, consent, the caps (I2 of the review).
  if (message.kind === "template") {
    if (message.templateId === null) throw new DomainError("CONFLICT", "TEMPLATE_NOT_APPROVED", "The template is gone");
    await assertTemplateAllowed(tx, access, {
      chat,
      templateId: message.templateId,
      parameters: message.templateParams,
      agreed: false,
      now,
    });
  }
  const updated = await tx.whatsappMessage.update({
    where: { id: message.id },
    data: { status: "queued", failureCode: null, wamid: null, sentAt: null, occurredAt: now, sentBy: access.userId },
    select: { id: true, status: true },
  });
  await showAsLast(tx, message.conversationId, message.id, now);
  await publishEvent(tx, {
    type: MESSAGE_QUEUED_EVENT,
    payload: { conversationId: message.conversationId, messageId: message.id },
  });
  return sentOf(updated);
}
