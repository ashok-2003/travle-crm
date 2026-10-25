// The notices a WhatsApp message sends (spec 4.8): "Priya wrote on WhatsApp" to the person's lead owner, once per ten minutes per
// chat, and "A past customer wrote on WhatsApp" to the same person. Neither holds a word of the message: a push may be read
// on a lock screen. Run in the worker on the events inbound publishes, keyed on the event, so a repeat tells no one twice.
// Who is told (R1): the owner of the person's newest open lead; else of their newest lead; else, with no owner, everyone who
// can assign leads.
import { whatsappMessageReceivedEvent, whatsappPastCustomerWroteEvent } from "@travel-crm/contracts/inbox";
import { openLeadStages } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { notify } from "../notifications/index.js";
import { chatNameOf } from "./chat-name.js";

const QUIET_MS = 10 * 60_000;

export interface NoticeDependencies {
  /** Everyone who holds leads:assign, for a chat nobody owns. */
  managers: (organizationId: string) => Promise<string[]>;
}

async function recipientsOf(
  tx: OrgTx,
  dependencies: NoticeDependencies,
  organizationId: string,
  personId: string | null,
): Promise<string[]> {
  if (personId !== null) {
    const leads = await tx.lead.findMany({
      where: { personId },
      orderBy: { id: "desc" },
      select: { stage: true, ownerUserId: true },
    });
    const open = leads.find((lead) => (openLeadStages as readonly string[]).includes(lead.stage));
    const owner = (open ?? leads[0])?.ownerUserId ?? null;
    if (owner !== null) return [owner];
  }
  return dependencies.managers(organizationId);
}

export function messageNoticeListener(dependencies: NoticeDependencies): EventListener {
  return defineListener({
    name: "whatsapp.notify-message",
    eventType: "whatsapp.message-received",
    payload: whatsappMessageReceivedEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const chat = await tx.whatsappConversation.findUnique({
          where: { id: event.payload.conversationId },
          select: {
            personId: true,
            phoneE164: true,
            profileName: true,
            hidden: true,
            person: { select: { name: true } },
          },
        });
        if (chat === null || chat.hidden) return;
        const recipientUserIds = await recipientsOf(tx, dependencies, event.organizationId, chat.personId);
        if (recipientUserIds.length === 0) return;
        const link = `/inbox/${event.payload.conversationId}`;
        // A burst is one notice: nothing while this chat's last notice is less than ten minutes old.
        const recent = await tx.notification.findFirst({
          where: { kind: "whatsapp.message", link, createdAt: { gt: new Date(event.occurredAt.getTime() - QUIET_MS) } },
          select: { id: true },
        });
        if (recent !== null) return;
        await notify(tx, context.actor, {
          recipientUserIds,
          sourceEventId: noticeKey(event.id, "whatsapp.message"),
          kind: "whatsapp.message",
          title: `${chatNameOf(chat) ?? "A customer"} wrote on WhatsApp`,
          body: "Open the chat to reply.",
          link,
          channels: ["push"],
        });
      });
    },
  });
}

export function pastCustomerNoticeListener(dependencies: NoticeDependencies): EventListener {
  return defineListener({
    name: "whatsapp.notify-past-customer",
    eventType: "whatsapp.past-customer-wrote",
    payload: whatsappPastCustomerWroteEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const chat = await tx.whatsappConversation.findUnique({
          where: { id: event.payload.conversationId },
          select: { personId: true, hidden: true },
        });
        if (chat === null || chat.hidden) return;
        const recipientUserIds = await recipientsOf(tx, dependencies, event.organizationId, chat.personId);
        if (recipientUserIds.length === 0) return;
        await notify(tx, context.actor, {
          recipientUserIds,
          sourceEventId: noticeKey(event.id, "whatsapp.past-customer"),
          kind: "whatsapp.past-customer",
          title: "A past customer wrote on WhatsApp",
          body: "Open the chat to reply or start a new lead.",
          link: `/inbox/${event.payload.conversationId}`,
          channels: ["push"],
        });
      });
    },
  });
}
