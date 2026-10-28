// An automatic WhatsApp to a lead (sales execution): the lead's chat is found or made for the agency's number, and the
// approved template goes through the inbox's one template send (consent, STOP, the day's and month's caps, WhatsApp's own
// limit), as the system. Inside the 24-hour window a plain message may go instead. What can't go now says whether a
// later try may (the day's cap, the number paused) or never will (no phone, the person asked to stop).
import type { OrgTx } from "@travel-crm/db";
import { liveConnection, queueCheckedTemplate, queueSystemText, windowIsOpen } from "../inbox/index.js";
import { DomainError, systemActor } from "../kernel/index.js";

export type AutoSendResult =
  { kind: "sent"; messageId: string } | { kind: "later"; reason: string } | { kind: "never"; reason: string };

/** Reasons a later minute may mend. */
const LATER = ["TEMPLATE_CAP_REACHED", "TIER_LIMIT_REACHED", "paused", "not_connected"];

/** The lead's person's chat on the agency's live number, made when there is none; null without a phone or a number. */
export async function chatForLead(tx: OrgTx, leadId: string) {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { personId: true, person: { select: { phoneE164: true } } },
  });
  const phoneE164 = lead?.person.phoneE164 ?? null;
  if (lead === null || phoneE164 === null) return { chat: null, reason: "no_phone" } as const;
  const connection = await liveConnection(tx);
  if (connection === null || connection.mode === "demo" || !["connected", "problem"].includes(connection.status)) {
    return { chat: null, reason: connection?.status === "paused" ? "paused" : "not_connected" } as const;
  }
  await tx.whatsappConversation.createMany({
    data: [{ connectionId: connection.id, phoneE164, personId: lead.personId }],
    skipDuplicates: true,
  });
  const chat = await tx.whatsappConversation.findFirstOrThrow({
    where: { connectionId: connection.id, phoneE164 },
    select: {
      id: true,
      personId: true,
      phoneE164: true,
      lastInboundAt: true,
      connectionId: true,
      hidden: true,
      state: true,
    },
  });
  if (chat.personId === null) {
    await tx.whatsappConversation.update({ where: { id: chat.id }, data: { personId: lead.personId } });
  }
  if (chat.hidden || chat.state !== "open") return { chat: null, reason: "unavailable" } as const;
  return { chat: { ...chat, personId: chat.personId ?? lead.personId }, reason: null } as const;
}

export async function sendToLead(
  tx: OrgTx,
  input: {
    organizationId: string;
    leadId: string;
    templateId: string | null;
    params: readonly string[];
    /** Plain words to send instead while the customer's 24-hour window is open, if any. */
    sessionText?: string;
    /** The agency said someone who enquired agreed to hear back on WhatsApp. */
    agreed: boolean;
    clientToken: string;
  },
  now: Date,
): Promise<AutoSendResult> {
  const found = await chatForLead(tx, input.leadId);
  if (found.chat === null) {
    return LATER.includes(found.reason)
      ? { kind: "later", reason: found.reason }
      : { kind: "never", reason: found.reason };
  }
  const chat = found.chat;
  if (input.sessionText !== undefined && windowIsOpen(chat.lastInboundAt, now)) {
    const sent = await queueSystemText(
      tx,
      {
        conversationId: chat.id,
        body: input.sessionText,
        sentBy: null,
        origin: "automation",
        clientToken: input.clientToken,
        answers: false,
      },
      now,
    );
    if (sent.ok) return { kind: "sent", messageId: sent.messageId };
    if (LATER.includes(sent.code)) return { kind: "later", reason: sent.code };
    if (input.templateId === null) return { kind: "never", reason: sent.code };
  }
  if (input.templateId === null) return { kind: "never", reason: "no_template" };
  try {
    const sent = await queueCheckedTemplate(
      tx,
      systemActor(input.organizationId),
      chat,
      {
        templateId: input.templateId,
        parameters: input.params,
        agreed: input.agreed,
        clientToken: input.clientToken,
        sentBy: null,
        mayStartChat: true,
      },
      now,
    );
    return { kind: "sent", messageId: sent.messageId };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return LATER.includes(error.reason)
      ? { kind: "later", reason: error.reason }
      : { kind: "never", reason: error.reason };
  }
}

/** Whether this touch's key is still free: false when it was made before (a repeat), so nothing is sent twice. */
export async function claimTouch(tx: OrgTx, touch: { key: string }): Promise<boolean> {
  const existing = await tx.salesTouch.findFirst({ where: { key: touch.key }, select: { id: true } });
  return existing === null;
}

export async function recordTouch(
  tx: OrgTx,
  touch: { kind: "speed" | "follow" | "reminder"; key: string; leadId: string | null },
  result: AutoSendResult,
): Promise<void> {
  await tx.salesTouch.createMany({
    data: [
      {
        kind: touch.kind,
        key: touch.key,
        leadId: touch.leadId,
        outcome: result.kind === "sent" ? "sent" : "skipped",
        reason: result.kind === "sent" ? null : result.reason,
        messageId: result.kind === "sent" ? result.messageId : null,
      },
    ],
    skipDuplicates: true,
  });
}
