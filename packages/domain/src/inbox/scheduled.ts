// Messages written now and sent later, and snoozed chats waking (sales inbox spec 6). A member schedules a reply for a
// moment within the chat's 24-hour window, or later (it then fails if the window has closed by then); the worker's due
// work, every minute, sends what is due through the ordinary outbox and reminds whoever snoozed a chat that wakes.
import { scheduledMessageList, type ScheduledMessage, type ScheduleMessageInput } from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import type { Logger } from "@travel-crm/integrations/logging";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { chatNameOf } from "./chat-name.js";
import { routesPage } from "./routes.js";
import { queueSystemText } from "./system-send.js";
import { visibleConversation } from "./views.js";

/** The worker's queue for the due work, each minute. */
export const INBOX_DUE_WORK_QUEUE = "inbox.due-work";

/** The kind of notice a waking chat sends its snoozer. */
export const SNOOZE_KIND = "inbox.snooze-ended";

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

/** One organization's due work: its scheduled messages whose time has come, and its snoozed chats that wake now. */
async function dueWorkOf(tx: OrgTx, organizationId: string, now: Date): Promise<number> {
  let done = 0;
  const due = await tx.scheduledMessage.findMany({
    where: { status: "pending", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: 50,
    select: { id: true, conversationId: true, body: true, createdBy: true },
  });
  for (const item of due) {
    const sent = await queueSystemText(
      tx,
      {
        conversationId: item.conversationId,
        body: item.body,
        sentBy: item.createdBy,
        clientToken: `scheduled:${item.id}`,
        answers: true,
      },
      now,
    );
    await tx.scheduledMessage.update({
      where: { id: item.id },
      data: sent.ok ? { status: "sent", messageId: sent.messageId } : { status: "failed", failureCode: sent.code },
    });
    done += 1;
  }
  const waking = await tx.whatsappConversation.findMany({
    where: { snoozedUntil: { lte: now } },
    take: 50,
    select: { id: true, snoozedBy: true, phoneE164: true, profileName: true, person: { select: { name: true } } },
  });
  for (const chat of waking) {
    await tx.whatsappConversation.update({ where: { id: chat.id }, data: { snoozedUntil: null, snoozedBy: null } });
    if (chat.snoozedBy !== null) {
      await notify(tx, systemActor(organizationId), {
        recipientUserIds: [chat.snoozedBy],
        kind: SNOOZE_KIND,
        title: `Time to get back to ${chatNameOf(chat) ?? "a customer"}`,
        body: "The chat you snoozed is back in your inbox.",
        link: `/inbox/${chat.id}`,
        channels: ["push"],
      });
    }
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
        done += await dependencies.db.forOrg(route.organizationId, (tx) => dueWorkOf(tx, route.organizationId, now));
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
