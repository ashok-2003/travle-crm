// The outbox's worker (spec 4.4 S1-S5): for each queued reply it checks again that the number is on and the window is open, waits
// for the per-minute budget, claims the row (`queued` to `sending`), calls MSG91 outside any transaction, and settles the row:
// `sent` with the message id, or `failed` with the reason. At most once, never silently twice (D7): an answer of "unsure" (a
// timeout) is a failure for a person to look at, not a try again; only a provider that never received it (down, or rate limited)
// is tried again by itself, for five minutes. A row left `sending` is the health check's to fail.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { whatsappMessageQueuedEvent } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import {
  retryableFailureReasons,
  type WhatsAppProvider,
  type WhatsAppSendResult,
} from "@travel-crm/integrations/whatsapp";
import { recordWhatsAppFirstReply } from "../crm/index.js";
import { noticeKey } from "../crm/notice-key.js";
import type { Files } from "../files/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../jobs/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { RateLimiter } from "../rate-limits/index.js";
import { chatNameOf } from "./chat-name.js";
import { MESSAGE_QUEUED_EVENT } from "./outbox.js";
import { settleNeedsReply } from "./needs-reply.js";
import { bumpUsage, monthStartOf } from "./usage.js";
import { windowIsOpen } from "./window.js";

/** At most this many replies a minute for one agency, and for all of them (a constant below MSG91's own, SPIKE(S6)). */
export const AGENCY_SENDS_PER_MINUTE = 60;
export const PLATFORM_SENDS_PER_MINUTE = 500;
/** A provider that did not receive the message is tried again for this long. */
const RETRY_FOR_MS = 5 * 60_000;

export interface SenderDependencies {
  /** Null when the MSG91 settings are not set: a queued reply then fails as "not connected". */
  provider: WhatsAppProvider | null;
  files: Pick<Files, "list" | "systemDownloadLink">;
  limiter: Pick<RateLimiter, "hit">;
  logger: Logger;
}

/** Why a reply did not go, as the row stores it and the chat words it. */
export type FailureCode =
  | "window_closed"
  | "not_on_whatsapp"
  | "bad_number"
  | "rate_limited"
  | "tier_limit"
  | "provider_down"
  | "unsure"
  | "paused"
  | "not_connected"
  | "file_missing"
  | "other";

const storedReason = (result: Extract<WhatsAppSendResult, { ok: false }>): FailureCode =>
  result.reason === "template_not_approved" ? "other" : result.reason;

interface Queued {
  id: string;
  kind: string;
  body: string | null;
  caption: string | null;
  fileName: string | null;
  /** When it was queued (or last tried again by a person). */
  queuedAt: Date;
  sentBy: string | null;
  conversationId: string;
  phoneE164: string;
  personId: string | null;
  lastInboundAt: Date | null;
  integratedNumber: string;
  connectionStatus: string;
  connectionId: string;
}

/** The queued message with what sending it needs, or null when it is not (or no longer) waiting. */
async function queuedMessage(tx: OrgTx, messageId: string): Promise<Queued | null> {
  const message = await tx.whatsappMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      kind: true,
      body: true,
      caption: true,
      fileName: true,
      occurredAt: true,
      sentBy: true,
      status: true,
      direction: true,
      origin: true,
      conversation: {
        select: {
          id: true,
          phoneE164: true,
          personId: true,
          lastInboundAt: true,
          connection: { select: { id: true, integratedNumber: true, status: true } },
        },
      },
    },
  });
  if (message?.status !== "queued" || message.direction !== "out" || message.origin !== "staff_crm") return null;
  const { conversation } = message;
  return {
    id: message.id,
    kind: message.kind,
    body: message.body,
    caption: message.caption,
    fileName: message.fileName,
    queuedAt: message.occurredAt,
    sentBy: message.sentBy,
    conversationId: conversation.id,
    phoneE164: conversation.phoneE164,
    personId: conversation.personId,
    lastInboundAt: conversation.lastInboundAt,
    integratedNumber: conversation.connection.integratedNumber,
    connectionStatus: conversation.connection.status,
    connectionId: conversation.connection.id,
  };
}

/** Ends the message as not sent: the reason, the usage count, the chat waiting again, and a notice to whoever sent it. */
async function fail(
  tx: OrgTx,
  message: Queued,
  code: FailureCode,
  eventId: string,
  context: ListenerContext,
  now: Date,
): Promise<void> {
  await tx.whatsappMessage.update({ where: { id: message.id }, data: { status: "failed", failureCode: code } });
  await settleNeedsReply(tx, message.conversationId);
  await bumpUsage(
    tx,
    { organizationId: context.actor.organizationId, connectionId: message.connectionId },
    monthStartOf(now, "Asia/Kolkata"),
    { failed: 1 },
  );
  if (message.sentBy === null) return;
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: message.conversationId },
    select: { phoneE164: true, profileName: true, person: { select: { name: true } } },
  });
  await notify(tx, context.actor, {
    recipientUserIds: [message.sentBy],
    sourceEventId: noticeKey(eventId, "whatsapp.send-failed"),
    kind: "whatsapp.send-failed",
    title: `Your message to ${chat === null ? "a customer" : (chatNameOf(chat) ?? chat.phoneE164)} wasn't sent`,
    body: "Open the chat and tap Try again.",
    link: `/inbox/${message.conversationId}`,
    channels: ["push"],
  });
}

/** The provider's call for this message: text, or a file with a link valid for a few minutes. */
async function callProvider(
  dependencies: SenderDependencies,
  provider: WhatsAppProvider,
  organizationId: string,
  message: Queued,
): Promise<WhatsAppSendResult | "file_missing"> {
  if (message.kind === "text")
    return provider.sendText(message.integratedNumber, message.phoneE164, message.body ?? "");
  const [file] = await dependencies.files.list(systemActor(organizationId), {
    recordType: WHATSAPP_RECORD_TYPE,
    recordId: message.id,
  });
  if (file === undefined) return "file_missing";
  const link = await dependencies.files.systemDownloadLink(organizationId, { attachmentId: file.id });
  const kind = message.kind === "image" || message.kind === "video" ? message.kind : "document";
  return provider.sendMedia(message.integratedNumber, message.phoneE164, {
    kind,
    url: link.url,
    ...(message.caption === null ? {} : { caption: message.caption }),
    ...(message.fileName === null ? {} : { fileName: message.fileName }),
  });
}

/** Why a queued message cannot go now, whatever the provider would say: the number is off or paused, or the window closed. */
function refusalOf(dependencies: SenderDependencies, message: Queued, now: Date): FailureCode | null {
  if (dependencies.provider === null) return "not_connected";
  if (message.connectionStatus === "paused") return "paused";
  if (message.connectionStatus !== "connected" && message.connectionStatus !== "problem") return "not_connected";
  return windowIsOpen(message.lastInboundAt, now) ? null : "window_closed";
}

export type SendOutcome = "sent" | "failed" | "skipped" | "waiting";

/** Sends one queued reply. Throws, so the job is tried again, only for a provider that did not take it or a budget that is spent. */
export async function sendQueued(
  dependencies: SenderDependencies,
  context: ListenerContext,
  event: { id: string; messageId: string },
  now: Date,
): Promise<SendOutcome> {
  const { organizationId } = context.actor;
  const message = await context.forOrg(async (tx) => {
    const queued = await queuedMessage(tx, event.messageId);
    if (queued === null) return null;
    const refusal = refusalOf(dependencies, queued, now);
    if (refusal === null) return { queued, refusal };
    await fail(tx, queued, refusal, event.id, context, now);
    return { queued, refusal };
  });
  if (message === null) return "skipped";
  if (message.refusal !== null) return "failed";
  const { queued } = message;
  const { provider } = dependencies;
  if (provider === null) return "failed";

  // The budget: over it, the message waits in the queue and the job is tried again after its backoff.
  const budget = await dependencies.limiter.hit(
    `whatsapp-send:${organizationId}`,
    { limit: AGENCY_SENDS_PER_MINUTE, windowSeconds: 60 },
    now,
  );
  const platform = budget.allowed
    ? await dependencies.limiter.hit(
        "whatsapp-send:platform",
        { limit: PLATFORM_SENDS_PER_MINUTE, windowSeconds: 60 },
        now,
      )
    : budget;
  if (!platform.allowed) throw ownMessage(new Error("The WhatsApp send budget is spent for this minute"));

  // Claim it: from here the row is ours alone, and `sentAt` holds the claim's time until the send is settled.
  const claimed = await context.forOrg((tx) =>
    tx.whatsappMessage.updateMany({
      where: { id: queued.id, status: "queued" },
      data: { status: "sending", sentAt: now },
    }),
  );
  if (claimed.count !== 1) return "skipped";

  let result: WhatsAppSendResult | "file_missing";
  try {
    result = await callProvider(dependencies, provider, organizationId, queued);
  } catch {
    // The call left and we do not know what came of it.
    result = { ok: false, reason: "unsure" };
  }

  if (result !== "file_missing" && !result.ok && retryableFailureReasons.includes(result.reason)) {
    if (now.getTime() - queued.queuedAt.getTime() < RETRY_FOR_MS) {
      await context.forOrg((tx) =>
        tx.whatsappMessage.update({ where: { id: queued.id }, data: { status: "queued", sentAt: null } }),
      );
      throw ownMessage(new Error("MSG91 did not take the WhatsApp message yet"));
    }
  }
  if (result !== "file_missing" && !result.ok) {
    dependencies.logger.info(
      { connectionId: queued.connectionId, reason: result.reason, providerCode: result.providerCode ?? null },
      "A WhatsApp reply was not sent",
    );
  }

  await context.forOrg(async (tx) => {
    if (result !== "file_missing" && result.ok) {
      await tx.whatsappMessage.update({
        where: { id: queued.id },
        data: { status: "sent", wamid: result.wamid, sentAt: now },
      });
      await tx.whatsappConnection.update({ where: { id: queued.connectionId }, data: { lastSendOkAt: now } });
      await bumpUsage(tx, { organizationId, connectionId: queued.connectionId }, monthStartOf(now, "Asia/Kolkata"), {
        replies: 1,
      });
      if (queued.personId !== null) await recordWhatsAppFirstReply(tx, queued.personId, now);
      return;
    }
    await fail(tx, queued, result === "file_missing" ? "file_missing" : storedReason(result), event.id, context, now);
  });
  return result !== "file_missing" && result.ok ? "sent" : "failed";
}

/** The listener on whatsapp.message-queued: sends the reply. Safe to run twice: only a queued row is ever claimed. */
export function sendMessageListener(dependencies: SenderDependencies): EventListener {
  return defineListener({
    name: "whatsapp.send-message",
    eventType: MESSAGE_QUEUED_EVENT,
    payload: whatsappMessageQueuedEvent,
    handle: async (event, context) => {
      await sendQueued(dependencies, context, { id: event.id, messageId: event.payload.messageId }, new Date());
    },
  });
}
