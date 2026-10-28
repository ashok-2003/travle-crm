// An automatic WhatsApp to a lead (sales execution): the lead's chat is found or made for the agency's number, and the
// approved template goes through the inbox's one template send (consent, STOP, the day's and month's caps, WhatsApp's own
// limit), as the system, and only to someone whose WhatsApp consent is on record and not withdrawn. Inside the
// 24-hour window of a customer who wrote, a plain message may go instead. STOP always wins: it ends the send. One
// cooldown is shared by every automatic message to a chat, and all pause once the customer replies. What can't go now
// says whether a later try may (the day's cap, the number paused, the cooldown) or never will (no phone, a STOP).
import type { OrgTx } from "@travel-crm/db";
import {
  liveConnection,
  queueCheckedTemplate,
  queueSystemText,
  whatsappConsentOf,
  windowIsOpen,
} from "../inbox/index.js";
import { DomainError, systemActor } from "../kernel/index.js";

export type AutoSendResult =
  { kind: "sent"; messageId: string } | { kind: "later"; reason: string } | { kind: "never"; reason: string };

/** Reasons a later minute may mend. */
const LATER = ["TEMPLATE_CAP_REACHED", "TIER_LIMIT_REACHED", "paused", "not_connected", "cooldown"];

/** Between two automatic messages to one chat, greeting, follow-ups and reminders alike. */
export const AUTOMATION_COOLDOWN_MS = 12 * 3_600_000;

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
  // STOP always wins, before any path: a person who withdrew is never written to by the system.
  const consent = await whatsappConsentOf(tx, chat.personId);
  if (consent.state === "withdrawn") return { kind: "never", reason: "opted_out" };
  // One cooldown for the chat, and a customer's reply pauses every automatic message.
  const lastAutomatic = await tx.whatsappMessage.findFirst({
    where: {
      conversationId: chat.id,
      direction: "out",
      origin: "automation",
      status: { notIn: ["failed", "superseded"] },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  if (lastAutomatic !== null) {
    if (chat.lastInboundAt !== null && chat.lastInboundAt.getTime() > lastAutomatic.occurredAt.getTime()) {
      return { kind: "never", reason: "customer_replied" };
    }
    if (now.getTime() - lastAutomatic.occurredAt.getTime() < AUTOMATION_COOLDOWN_MS) {
      return { kind: "later", reason: "cooldown" };
    }
  }
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
    if (sent.code === "opted_out") return { kind: "never", reason: "opted_out" };
    if (LATER.includes(sent.code)) return { kind: "later", reason: sent.code };
    if (input.templateId === null) return { kind: "never", reason: sent.code };
  }
  if (input.templateId === null) return { kind: "never", reason: "no_template" };
  // A template starts or restarts a chat: only with a consent on record (never granted for them by the agency's word).
  if (consent.state !== "granted") return { kind: "never", reason: "no_consent" };
  try {
    const sent = await queueCheckedTemplate(
      tx,
      systemActor(input.organizationId),
      chat,
      {
        templateId: input.templateId,
        parameters: input.params,
        agreed: false,
        clientToken: input.clientToken,
        sentBy: null,
        mayStartChat: true,
        origin: "automation",
      },
      now,
    );
    return { kind: "sent", messageId: sent.messageId };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    if (error.reason === "NO_CONSENT_FOR_TEMPLATE") return { kind: "never", reason: "opted_out" };
    return LATER.includes(error.reason)
      ? { kind: "later", reason: error.reason }
      : { kind: "never", reason: error.reason };
  }
}

/** Whether this touch's key was claimed already (a read, for planning): a repeat sends nothing twice. */
export async function touchTaken(tx: OrgTx, key: string): Promise<boolean> {
  return (await tx.salesTouch.findFirst({ where: { key }, select: { id: true } })) !== null;
}

/**
 * Claims a touch by inserting it first: the unique key is the lock, so two runs at once cannot both send. False when
 * it was claimed before. A claim that must wait is released with releaseTouch; otherwise recordTouch writes its outcome.
 */
export async function claimTouch(
  tx: OrgTx,
  touch: { kind: "speed" | "follow" | "reminder"; key: string; leadId: string | null },
): Promise<boolean> {
  const claimed = await tx.salesTouch.createMany({
    data: [{ kind: touch.kind, key: touch.key, leadId: touch.leadId, outcome: "pending" }],
    skipDuplicates: true,
  });
  return claimed.count === 1;
}

/** Gives a claim back, when the send can only go later. */
export async function releaseTouch(tx: OrgTx, key: string): Promise<void> {
  await tx.salesTouch.deleteMany({ where: { key, outcome: "pending" } });
}

export async function recordTouch(tx: OrgTx, touch: { key: string }, result: AutoSendResult): Promise<void> {
  await tx.salesTouch.updateMany({
    where: { key: touch.key },
    data: {
      outcome: result.kind === "sent" ? "sent" : "skipped",
      reason: result.kind === "sent" ? null : result.reason,
      messageId: result.kind === "sent" ? result.messageId : null,
    },
  });
}
