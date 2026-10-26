// Messages written now and sent later, and snoozed chats waking (sales inbox spec 6). A member schedules a reply for a moment
// inside the chat's 24-hour window (a later one is refused: free text can't go then, and a template is a different send); the
// worker's due work, every minute, sends what is due through the ordinary outbox, tells the writer of one that can't go, and
// reminds whoever snoozed a chat that wakes. Overlapping runs never double a send: rows are claimed with SKIP LOCKED and a
// send's token is the scheduled row's.
import { scheduledMessageList, type ScheduledMessage, type ScheduleMessageInput } from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import type { Logger } from "@travel-crm/integrations/logging";
import { recordAudit } from "../audit/index.js";
import { noticeKey } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { askForBatch } from "./broadcast.js";
import { chatNameOf } from "./chat-name.js";
import { routesPage } from "./routes.js";
import { queueSystemText } from "./system-send.js";
import { visibleConversation } from "./views.js";
import { windowEndOf } from "./window.js";

/** The worker's queue for the due work, each minute. */
export const INBOX_DUE_WORK_QUEUE = "inbox.due-work";

/** The kind of notice a waking chat sends its snoozer. */
export const SNOOZE_KIND = "inbox.snooze-ended";

/** The kind of notice a scheduled message that could not be sent sends its writer (the same as any reply that failed). */
const SEND_FAILED_KIND = "whatsapp.send-failed";

/** At most this many scheduled messages, and as many waking chats, are handled in one agency's run. */
const BATCH = 50;

const fields = { id: true, body: true, sendAt: true, status: true, failureCode: true } as const;
const shown = (row: { id: string; body: string; sendAt: Date; status: string; failureCode: string | null }) => ({
  ...row,
  sendAt: row.sendAt.toISOString(),
});

/** The chat's scheduled messages still to send, soonest first, and the last few that failed. */
export async function listScheduled(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
): Promise<ScheduledMessage[]> {
  const chat = await visibleConversation(tx, access, conversationId);
  const rows = await tx.scheduledMessage.findMany({
    where: { conversationId: chat.id, status: { in: ["pending", "failed"] } },
    orderBy: { sendAt: "asc" },
    take: 20,
    select: fields,
  });
  return scheduledMessageList.parse(rows.map(shown));
}

export async function scheduleMessage(
  tx: OrgTx,
  access: MemberAccess,
  input: ScheduleMessageInput,
  now: Date,
): Promise<ScheduledMessage> {
  const chat = await visibleConversation(tx, access, input.conversationId);
  const sendAt = new Date(input.sendAt);
  if (sendAt.getTime() <= now.getTime() + 30_000) {
    throw new DomainError("VALIDATION", "DUE_IN_THE_PAST", "Choose a time after now");
  }
  // Free text goes only inside the window the customer opened; a later time would fail when it came.
  const windowEnd = windowEndOf(chat.lastInboundAt);
  if (windowEnd === null || sendAt.getTime() >= windowEnd.getTime() || windowEnd.getTime() <= now.getTime()) {
    throw new DomainError(
      "CONFLICT",
      "SCHEDULE_OUTSIDE_WINDOW",
      "The 24-hour window will be closed at that time; choose an earlier time or send a template",
    );
  }
  const row = await tx.scheduledMessage.create({
    data: { conversationId: chat.id, body: input.body, sendAt, createdBy: access.userId },
    select: fields,
  });
  await recordAudit(tx, access, {
    action: "inbox.message-scheduled",
    entityType: "whatsapp_conversation",
    entityId: chat.id,
    after: { when: sendAt.toISOString() },
  });
  return scheduledMessageList.element.parse(shown(row));
}

export async function cancelScheduled(tx: OrgTx, access: MemberAccess, scheduledId: string): Promise<void> {
  const row = await tx.scheduledMessage.findUnique({
    where: { id: scheduledId },
    select: { id: true, conversationId: true, status: true },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await visibleConversation(tx, access, row.conversationId);
  if (row.status !== "pending" && row.status !== "failed") return;
  await tx.scheduledMessage.update({ where: { id: row.id }, data: { status: "cancelled" } });
  await recordAudit(tx, access, {
    action: "inbox.scheduled-cancelled",
    entityType: "whatsapp_conversation",
    entityId: row.conversationId,
  });
}

interface DueMessage {
  id: string;
  conversationId: string;
  body: string;
  createdBy: string;
}
interface WakingChat {
  id: string;
  snoozedBy: string | null;
  snoozedUntil: Date;
}

/** Why a send failed that a later minute may mend: the number is paused, or not connected for now. */
const TRANSIENT = ["paused", "not_connected"];

/**
 * Sends one due message, or fails it and tells its writer; either way the row leaves "pending", except when the number is
 * only paused or off for the moment: it stays scheduled and is tried again, until the 24-hour window closes (that fails it).
 * Returns whether the row was settled.
 */
async function sendDue(tx: OrgTx, organizationId: string, item: DueMessage, now: Date): Promise<boolean> {
  const sent = await queueSystemText(
    tx,
    {
      conversationId: item.conversationId,
      body: item.body,
      sentBy: item.createdBy,
      origin: "staff_crm",
      clientToken: `scheduled:${item.id}`,
      answers: true,
    },
    now,
  );
  if (sent.ok) {
    await tx.scheduledMessage.update({ where: { id: item.id }, data: { status: "sent", messageId: sent.messageId } });
    return true;
  }
  if (TRANSIENT.includes(sent.code)) return false;
  await tx.scheduledMessage.update({ where: { id: item.id }, data: { status: "failed", failureCode: sent.code } });
  const actor = systemActor(organizationId);
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: item.conversationId },
    select: { phoneE164: true, profileName: true, person: { select: { name: true } } },
  });
  await recordAudit(tx, actor, {
    action: "inbox.scheduled-failed",
    entityType: "whatsapp_conversation",
    entityId: item.conversationId,
    after: { code: sent.code },
  });
  await notify(tx, actor, {
    recipientUserIds: [item.createdBy],
    sourceEventId: noticeKey(item.id, SEND_FAILED_KIND),
    kind: SEND_FAILED_KIND,
    title: `Your scheduled message to ${chat === null ? "a customer" : (chatNameOf(chat) ?? chat.phoneE164)} wasn't sent`,
    body: "Open the chat to write it again.",
    link: `/inbox/${item.conversationId}`,
    channels: ["push"],
  });
  return true;
}

/** Wakes the chat and reminds whoever snoozed it. The notice's key is the snooze's own, so a repeat adds nothing. */
async function wake(tx: OrgTx, organizationId: string, chat: WakingChat): Promise<void> {
  await tx.whatsappConversation.update({ where: { id: chat.id }, data: { snoozedUntil: null, snoozedBy: null } });
  if (chat.snoozedBy === null) return;
  const named = await tx.whatsappConversation.findUnique({
    where: { id: chat.id },
    select: { phoneE164: true, profileName: true, person: { select: { name: true } } },
  });
  await notify(tx, systemActor(organizationId), {
    recipientUserIds: [chat.snoozedBy],
    sourceEventId: noticeKey(`${chat.id}:${String(chat.snoozedUntil.getTime())}`, SNOOZE_KIND),
    kind: SNOOZE_KIND,
    title: `Time to get back to ${(named === null ? null : chatNameOf(named)) ?? "a customer"}`,
    body: "The chat you snoozed is back in your inbox.",
    link: `/inbox/${chat.id}`,
    channels: ["push"],
  });
}

/** The next due scheduled message other than those that already failed this run, or null. */
const nextDueMessage = (tx: OrgTx, now: Date, skipping: string[]) =>
  tx.scheduledMessage.findFirst({
    where: { status: "pending", sendAt: { lte: now }, id: { notIn: skipping } },
    orderBy: [{ sendAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

/**
 * One organization's due work: its scheduled messages whose time has come, its snoozed chats that wake now, and the
 * broadcasts with recipients that waited for this moment. A light read of the partial indexes first, so an agency with
 * nothing due costs one small transaction; then each message and each chat in a transaction of its own (claimed with SKIP
 * LOCKED, so overlapping runs never double), so one that throws is left for the next minute and never stops the rest.
 * Returns how many it handled.
 */
export async function runDueWorkFor(
  dependencies: { db: Database; logger?: Logger },
  organizationId: string,
  now: Date,
): Promise<number> {
  const { db } = dependencies;
  const probe = await db.forOrg(organizationId, async (tx) => {
    const broadcasts = await tx.whatsappBroadcastRecipient.findMany({
      // Recipients that waited for a morning or an hour, and are due now: their broadcast is asked to go on.
      where: { state: "waiting", notBefore: { lte: now }, broadcast: { is: { status: "sending" } } },
      distinct: ["broadcastId"],
      take: 20,
      select: { broadcastId: true },
    });
    for (const { broadcastId } of broadcasts) await askForBatch(tx, broadcastId);
    return {
      asked: broadcasts.length,
      sends: (await nextDueMessage(tx, now, [])) !== null,
      wakes:
        (await tx.whatsappConversation.findFirst({ where: { snoozedUntil: { lte: now } }, select: { id: true } })) !==
        null,
    };
  });
  let done = probe.asked;
  const failed: string[] = [];
  const guarded = async (id: string, work: () => Promise<boolean>) => {
    try {
      return await work();
    } catch (error) {
      failed.push(id);
      dependencies.logger?.error(
        { error: error instanceof Error ? error.name : "unknown" },
        "One of the inbox's due items failed and is left for the next minute",
      );
      return false;
    }
  };
  for (let index = 0; probe.sends && index < BATCH; index += 1) {
    const next = await db.forOrg(organizationId, (tx) => nextDueMessage(tx, now, failed));
    if (next === null) break;
    const settled = await guarded(next.id, () =>
      db.forOrg(organizationId, async (tx) => {
        const [item] = await tx.$queryRaw<DueMessage[]>`
          SELECT id, conversation_id AS "conversationId", body, created_by AS "createdBy"
          FROM scheduled_message WHERE id = ${next.id}::uuid AND status = 'pending' FOR UPDATE SKIP LOCKED`;
        return item === undefined ? false : sendDue(tx, organizationId, item, now);
      }),
    );
    if (settled) done += 1;
    else if (!failed.includes(next.id)) failed.push(next.id);
  }
  for (let index = 0; probe.wakes && index < BATCH; index += 1) {
    const woke = await db.forOrg(organizationId, async (tx) => {
      const [chat] = await tx.$queryRaw<WakingChat[]>`
        SELECT id, snoozed_by AS "snoozedBy", snoozed_until AS "snoozedUntil"
        FROM whatsapp_conversation
        WHERE snoozed_until <= ${now}
        ORDER BY snoozed_until, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      if (chat === undefined) return false;
      await wake(tx, organizationId, chat);
      return true;
    });
    if (!woke) break;
    done += 1;
  }
  return done;
}

/** Every connected agency's due work (the worker's `inbox.due-work`, each minute). One agency failing never stops the rest. */
export async function runDueWork(dependencies: { db: Database; logger: Logger }, now: Date): Promise<number> {
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const route of page) {
      try {
        done += await runDueWorkFor(dependencies, route.organizationId, now);
      } catch (error) {
        dependencies.logger.error(
          { connectionId: route.connectionId, error: error instanceof Error ? error.name : "unknown" },
          "The inbox's due work failed for an agency",
        );
      }
    }
    if (page.length < 100) return done;
    after = page.at(-1)?.integratedNumber;
  }
}
