// The worker's side of a broadcast (sales inbox spec 6, rebuilt 2026-10-26): on "broadcast-ready" it sends the waiting
// recipients a batch at a time, each through the same template send as one person's (consent, STOP, the day's and the month's
// caps under the connection's lock), with a token of the broadcast and the chat so a retry or an overlapping run never sends
// twice. Recipients over today's template cap wait for the next morning; over the month's, they are skipped. When WhatsApp
// refuses too many (the failure rate), the broadcast pauses itself, says why, and tells its creator. Safe to run twice.
import {
  BROADCAST_NEXT_DAY_HOUR,
  BROADCAST_PAUSE_FAILURE_RATE,
  BROADCAST_PAUSE_MIN_SETTLED,
  whatsappBroadcastReadyEvent,
} from "@travel-crm/contracts/inbox";
import { sql, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { noticeKey } from "../crm/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { addDays, calendarDateIn, DomainError, instantAt, parseTimeOfDay, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { askForBatch, BROADCAST_READY_EVENT, REFUSALS_OF_OURS } from "./broadcast.js";
import { liveConnection } from "./connection-row.js";
import { queueCheckedTemplate } from "./template-send.js";
import { whatsappConsentOf } from "./whatsapp-consent.js";

/** Recipients one run handles, each in a transaction of its own, before it asks for another run. */
const BATCH = 20;
/** WhatsApp's refusals that say something is wrong with the sending (a customer's number not being on WhatsApp is not one). */
/** How long a recipient waits after WhatsApp's own limit on new chats was reached. */
const TIER_WAIT_MS = 3_600_000;
/** How long the recipients wait when the number is paused or not connected. */
const NUMBER_WAIT_MS = 10 * 60_000;

type Step = "sent" | "stop" | "none";

/** The next morning at BROADCAST_NEXT_DAY_HOUR:00 in the organization's zone. */
export function nextMorning(now: Date, timeZone: string): Date {
  return instantAt(
    addDays(calendarDateIn(now, timeZone), 1),
    parseTimeOfDay(`${String(BROADCAST_NEXT_DAY_HOUR).padStart(2, "0")}:00`),
    timeZone,
  );
}

/** Pauses the broadcast with a reason, and tells whoever made it. */
async function pause(
  tx: OrgTx,
  broadcast: { id: string; createdBy: string; organizationId: string },
  reason: "failure_rate" | "template_unavailable",
  now: Date,
): Promise<void> {
  await tx.whatsappBroadcast.update({
    where: { id: broadcast.id },
    data: { status: "paused", pausedReason: reason, pausedAt: now },
  });
  const actor = systemActor(broadcast.organizationId);
  await recordAudit(tx, actor, {
    action: "inbox.broadcast-paused",
    entityType: "whatsapp_broadcast",
    entityId: broadcast.id,
    after: { reason },
  });
  await notify(tx, actor, {
    recipientUserIds: [broadcast.createdBy],
    sourceEventId: noticeKey(`${broadcast.id}:${String(now.getTime())}`, "inbox.broadcast-paused"),
    kind: "whatsapp.needs-attention",
    title: "A broadcast paused itself",
    body: reason === "failure_rate" ? "WhatsApp refused too many messages." : "Its template can't be sent now.",
    link: `/inbox/broadcasts/${broadcast.id}`,
    channels: ["push"],
  });
}

/** Whether WhatsApp has refused enough of what this broadcast sent since it last paused to stop it. */
async function tooManyRefused(tx: OrgTx, broadcastId: string, since: Date | null): Promise<boolean> {
  const where = { broadcastId, ...(since === null ? {} : { occurredAt: { gt: since } }) };
  const refused = await tx.whatsappMessage.count({
    where: { ...where, status: "failed", failureCode: { in: REFUSALS_OF_OURS } },
  });
  if (refused === 0) return false;
  const settled = await tx.whatsappMessage.count({
    where: { ...where, status: { in: ["sent", "delivered", "read", "failed"] } },
  });
  return settled >= BROADCAST_PAUSE_MIN_SETTLED && refused / settled >= BROADCAST_PAUSE_FAILURE_RATE;
}

/** One waiting recipient, if one is due: sent, skipped, left waiting, or failed. */
async function sendNext(
  tx: OrgTx,
  broadcastId: string,
  organizationId: string,
  timeZone: string,
  now: Date,
): Promise<Step> {
  // Held until the end, so a cancel that comes now waits, and then recalls what this send queued.
  await tx.$queryRaw`SELECT id FROM whatsapp_broadcast WHERE id = ${broadcastId}::uuid FOR UPDATE`;
  const broadcast = await tx.whatsappBroadcast.findUnique({
    where: { id: broadcastId },
    select: { id: true, status: true, templateId: true, params: true, createdBy: true, pausedAt: true },
  });
  if (broadcast?.status !== "sending") return "stop";
  const owner = { id: broadcast.id, createdBy: broadcast.createdBy, organizationId };
  if (await tooManyRefused(tx, broadcast.id, broadcast.pausedAt)) {
    await pause(tx, owner, "failure_rate", now);
    return "stop";
  }
  const [next] = await tx.$queryRaw<{ id: string; conversationId: string }[]>(sql`
    SELECT id, conversation_id AS "conversationId" FROM whatsapp_broadcast_recipient
    WHERE broadcast_id = ${broadcast.id}::uuid AND state = 'waiting' AND not_before <= ${now}
    ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
  if (next === undefined) return "none";
  const settle = (state: "sent" | "skipped" | "failed", reason: string | null, messageId: string | null = null) =>
    tx.whatsappBroadcastRecipient.update({ where: { id: next.id }, data: { state, reason, messageId } });
  const holdAll = (until: Date) =>
    tx.whatsappBroadcastRecipient.updateMany({
      where: { broadcastId: broadcast.id, state: "waiting", notBefore: { lte: now } },
      data: { notBefore: until },
    });

  const connection = await liveConnection(tx);
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: next.conversationId },
    select: {
      id: true,
      personId: true,
      connectionId: true,
      lastInboundAt: true,
      phoneE164: true,
      hidden: true,
      state: true,
    },
  });
  if (chat === null || chat.hidden || chat.state !== "open") {
    await settle("skipped", "unavailable");
    return "sent";
  }
  if (connection?.id !== chat.connectionId || !["connected", "problem"].includes(connection.status)) {
    await holdAll(new Date(now.getTime() + NUMBER_WAIT_MS));
    return "stop";
  }
  const consent = chat.personId === null ? null : await whatsappConsentOf(tx, chat.personId);
  if (consent?.state !== "granted") {
    await settle("skipped", consent?.state === "withdrawn" ? "opted_out" : "no_consent");
    return "sent";
  }
  try {
    const sent = await queueCheckedTemplate(
      tx,
      systemActor(organizationId),
      {
        id: chat.id,
        personId: chat.personId,
        phoneE164: chat.phoneE164,
        lastInboundAt: chat.lastInboundAt,
        connectionId: connection.id,
      },
      {
        templateId: broadcast.templateId,
        parameters: broadcast.params,
        agreed: false,
        clientToken: `broadcast:${broadcast.id}:${chat.id}`,
        sentBy: broadcast.createdBy,
        broadcastId: broadcast.id,
        mayStartChat: true,
      },
      now,
    );
    await settle("sent", null, sent.messageId);
    return "sent";
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    switch (error.reason) {
      case "MARKETING_CAP_REACHED":
        await settle("skipped", "monthly_cap");
        return "sent";
      case "TEMPLATE_CAP_REACHED":
        await holdAll(nextMorning(now, timeZone));
        return "stop";
      case "TIER_LIMIT_REACHED":
        await holdAll(new Date(now.getTime() + TIER_WAIT_MS));
        return "stop";
      case "NO_CONSENT_FOR_TEMPLATE":
        await settle("skipped", "opted_out");
        return "sent";
      case "CONSENT_TICK_NEEDED":
        await settle("skipped", "no_consent");
        return "sent";
      case "TEMPLATE_NOT_APPROVED":
        await pause(tx, owner, "template_unavailable", now);
        return "stop";
      default:
        await settle("failed", "other");
        return "sent";
    }
  }
}

/** After a batch: done when nothing waits; else another run is asked for if something is due. */
async function afterBatch(tx: OrgTx, broadcastId: string, now: Date): Promise<void> {
  const broadcast = await tx.whatsappBroadcast.findUnique({ where: { id: broadcastId }, select: { status: true } });
  if (broadcast?.status !== "sending") return;
  const waiting = await tx.whatsappBroadcastRecipient.count({ where: { broadcastId, state: "waiting" } });
  if (waiting === 0) {
    await tx.whatsappBroadcast.update({ where: { id: broadcastId }, data: { status: "done" } });
    return;
  }
  const due = await tx.whatsappBroadcastRecipient.count({
    where: { broadcastId, state: "waiting", notBefore: { lte: now } },
  });
  if (due > 0) await askForBatch(tx, broadcastId);
}

/** Runs one batch of a broadcast: what the listener does, and what the tests call. Returns how many it handled. */
export async function sendBroadcastBatch(
  context: { organizationId: string; forOrg: <T>(work: (tx: OrgTx) => Promise<T>) => Promise<T> },
  broadcastId: string,
  timeZone: string,
  now: Date,
): Promise<number> {
  let handled = 0;
  for (let index = 0; index < BATCH; index += 1) {
    const step = await context.forOrg((tx) => sendNext(tx, broadcastId, context.organizationId, timeZone, now));
    if (step !== "sent") break;
    handled += 1;
  }
  await context.forOrg((tx) => afterBatch(tx, broadcastId, now));
  return handled;
}

/** The worker's listener on "broadcast-ready". */
export function broadcastListener(dependencies: {
  timeZone: (organizationId: string) => Promise<string>;
}): EventListener {
  return defineListener({
    name: "inbox.send-broadcast",
    eventType: BROADCAST_READY_EVENT,
    payload: whatsappBroadcastReadyEvent,
    handle: async (event, context) => {
      const timeZone = await dependencies.timeZone(event.organizationId);
      await sendBroadcastBatch(
        { organizationId: event.organizationId, forOrg: (work) => context.forOrg(work) },
        event.payload.broadcastId,
        timeZone,
        new Date(),
      );
    },
  });
}
