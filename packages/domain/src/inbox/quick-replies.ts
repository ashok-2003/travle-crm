// Quick replies (sales inbox spec, section 5): saved answers staff insert by typing "/" and a shortcut, with `{name}`,
// `{destination}`, `{month}` and `{agent}` filled from the chat in the browser. Everyone who may reply reads them; the
// agency's Owner and Admins (inbox:templates) write them. The one with the shortcut "payment" is Payment details.
import {
  quickReply,
  quickReplyList,
  type CreateQuickReplyInput,
  type QuickReply,
  type UpdateQuickReplyInput,
} from "@travel-crm/contracts/inbox";
import { isUniqueViolation, softDeleted, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const fields = { id: true, shortcut: true, title: true, body: true } as const;
const shortcutTaken = () => new DomainError("CONFLICT", "QUICK_REPLY_SHORTCUT_TAKEN", "This shortcut is in use");

export async function listQuickReplies(tx: OrgTx): Promise<QuickReply[]> {
  return quickReplyList.parse(await tx.inboxQuickReply.findMany({ orderBy: { shortcut: "asc" }, select: fields }));
}

export async function createQuickReply(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateQuickReplyInput,
): Promise<QuickReply> {
  if ((await tx.inboxQuickReply.findFirst({ where: { shortcut: input.shortcut }, select: { id: true } })) !== null) {
    throw shortcutTaken();
  }
  try {
    const row = await tx.inboxQuickReply.create({ data: { ...input, createdBy: access.userId }, select: fields });
    await recordAudit(tx, access, {
      action: "inbox.quick-reply-created",
      entityType: "inbox_quick_reply",
      entityId: row.id,
      after: { shortcut: row.shortcut, title: row.title },
    });
    return quickReply.parse(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw shortcutTaken();
    throw error;
  }
}

export async function updateQuickReply(
  tx: OrgTx,
  access: MemberAccess,
  input: UpdateQuickReplyInput,
): Promise<QuickReply> {
  const { quickReplyId, ...changes } = input;
  const before = await tx.inboxQuickReply.findUnique({ where: { id: quickReplyId }, select: fields });
  if (before === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const clash = await tx.inboxQuickReply.findFirst({
    where: { shortcut: changes.shortcut, id: { not: quickReplyId } },
    select: { id: true },
  });
  if (clash !== null) throw shortcutTaken();
  try {
    const row = await tx.inboxQuickReply.update({ where: { id: quickReplyId }, data: changes, select: fields });
    await recordAudit(tx, access, {
      action: "inbox.quick-reply-changed",
      entityType: "inbox_quick_reply",
      entityId: row.id,
      before: { shortcut: before.shortcut, title: before.title },
      after: { shortcut: row.shortcut, title: row.title },
    });
    return quickReply.parse(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw shortcutTaken();
    throw error;
  }
}

export async function deleteQuickReply(tx: OrgTx, access: MemberAccess, quickReplyId: string): Promise<void> {
  const before = await tx.inboxQuickReply.findUnique({ where: { id: quickReplyId }, select: fields });
  if (before === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await tx.inboxQuickReply.update({ where: { id: quickReplyId }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "inbox.quick-reply-deleted",
    entityType: "inbox_quick_reply",
    entityId: quickReplyId,
    before: { shortcut: before.shortcut, title: before.title },
  });
}
