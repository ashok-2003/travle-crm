// A chat's place in the inbox (sales inbox spec, section 5): pinned to the top for everyone, archived out of the main list
// until the customer writes again, and each member's read mark, from which their unread counts come.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { visibleConversations } from "./scope.js";

async function openChat(tx: OrgTx, access: MemberAccess, conversationId: string) {
  const chat = await tx.whatsappConversation.findFirst({
    where: { AND: [{ id: conversationId, state: "open" }, visibleConversations(access)] },
    select: { id: true, pinnedAt: true, archivedAt: true },
  });
  if (chat === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  return chat;
}

export async function pinConversation(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
  on: boolean,
  now: Date,
): Promise<void> {
  const chat = await openChat(tx, access, conversationId);
  if ((chat.pinnedAt !== null) === on) return;
  await tx.whatsappConversation.update({ where: { id: chat.id }, data: { pinnedAt: on ? now : null } });
  const about = { entityType: "whatsapp_conversation", entityId: chat.id };
  if (on) await recordAudit(tx, access, { action: "inbox.chat-pinned", ...about });
  else await recordAudit(tx, access, { action: "inbox.chat-unpinned", ...about });
}

export async function archiveConversation(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
  on: boolean,
  now: Date,
): Promise<void> {
  const chat = await openChat(tx, access, conversationId);
  if ((chat.archivedAt !== null) === on) return;
  // An archived chat is no longer pinned: it has left the list.
  await tx.whatsappConversation.update({
    where: { id: chat.id },
    data: on ? { archivedAt: now, pinnedAt: null } : { archivedAt: null },
  });
  const about = { entityType: "whatsapp_conversation", entityId: chat.id };
  if (on) await recordAudit(tx, access, { action: "inbox.chat-archived", ...about });
  else await recordAudit(tx, access, { action: "inbox.chat-unarchived", ...about });
}

/** The member has the chat open now: everything the customer wrote so far is read for them. Not audited (it is reading). */
export async function markConversationRead(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
  now: Date,
): Promise<void> {
  const chat = await openChat(tx, access, conversationId);
  await tx.conversationRead.upsert({
    where: {
      organizationId_conversationId_userId: {
        organizationId: access.organizationId,
        conversationId: chat.id,
        userId: access.userId,
      },
    },
    create: { conversationId: chat.id, userId: access.userId, readAt: now },
    update: { readAt: now },
  });
}

/** Star a message for the team, or take the star off (sales inbox spec 6). Audited: the log says who starred what chat. */
export async function starMessage(
  tx: OrgTx,
  access: MemberAccess,
  messageId: string,
  on: boolean,
  now: Date,
): Promise<void> {
  const message = await tx.whatsappMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, starredAt: true },
  });
  if (message === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await openChat(tx, access, message.conversationId);
  if ((message.starredAt !== null) === on) return;
  await tx.whatsappMessage.update({
    where: { id: message.id },
    data: on ? { starredAt: now, starredBy: access.userId } : { starredAt: null, starredBy: null },
  });
  const about = { entityType: "whatsapp_conversation", entityId: message.conversationId };
  if (on) await recordAudit(tx, access, { action: "inbox.message-starred", ...about });
  else await recordAudit(tx, access, { action: "inbox.message-unstarred", ...about });
}

/** The furthest ahead a chat may be snoozed: a year. */
export const MAX_SNOOZE_MS = 365 * 24 * 3_600_000;

/**
 * Snooze a chat until a moment: it leaves the lists until then, when whoever snoozed it is reminded (the worker's due
 * work). Null wakes it now. A moment already past is refused.
 */
export async function snoozeConversation(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
  until: Date | null,
  now: Date,
): Promise<void> {
  const chat = await openChat(tx, access, conversationId);
  if (until !== null && until.getTime() <= now.getTime()) {
    throw new DomainError("VALIDATION", "DUE_IN_THE_PAST", "Choose a time after now");
  }
  if (until !== null && until.getTime() > now.getTime() + MAX_SNOOZE_MS) {
    throw new DomainError("VALIDATION", "SNOOZE_TOO_LONG", "A chat can be snoozed for a year at most");
  }
  await tx.whatsappConversation.update({
    where: { id: chat.id },
    data: until === null ? { snoozedUntil: null, snoozedBy: null } : { snoozedUntil: until, snoozedBy: access.userId },
  });
  const about = { entityType: "whatsapp_conversation", entityId: chat.id };
  if (until === null) await recordAudit(tx, access, { action: "inbox.chat-woken", ...about });
  else await recordAudit(tx, access, { action: "inbox.chat-snoozed", ...about, after: { until: until.toISOString() } });
}
