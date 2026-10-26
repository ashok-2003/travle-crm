// The agency's tags for chats (sales inbox spec, section 5): the list (managed with inbox:templates), and the tags on one
// chat (set by anyone who may reply to it). A deleted tag leaves every chat it was on; its name is free again.
import {
  inboxTag,
  inboxTagList,
  type CreateInboxTagInput,
  type InboxTag,
  type SetConversationTagsInput,
} from "@travel-crm/contracts/inbox";
import { isUniqueViolation, softDeleted, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { visibleConversations } from "./scope.js";

export async function listTags(tx: OrgTx): Promise<InboxTag[]> {
  const rows = await tx.inboxTag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return inboxTagList.parse(rows);
}

export async function createTag(tx: OrgTx, access: MemberAccess, input: CreateInboxTagInput): Promise<InboxTag> {
  const taken = await tx.inboxTag.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken !== null) throw new DomainError("CONFLICT", "TAG_NAME_TAKEN", "A tag of this name exists");
  try {
    const row = await tx.inboxTag.create({
      data: { name: input.name, createdBy: access.userId },
      select: { id: true, name: true },
    });
    await recordAudit(tx, access, {
      action: "inbox.tag-created",
      entityType: "inbox_tag",
      entityId: row.id,
      after: { name: row.name },
    });
    return inboxTag.parse(row);
  } catch (error) {
    // Two people adding the same name at once: the live-name index takes one.
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "TAG_NAME_TAKEN", "A tag of this name exists");
    }
    throw error;
  }
}

export async function deleteTag(tx: OrgTx, access: MemberAccess, tagId: string): Promise<void> {
  const tag = await tx.inboxTag.findUnique({ where: { id: tagId }, select: { id: true, name: true } });
  if (tag === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await tx.conversationTag.deleteMany({ where: { tagId } });
  await tx.inboxTag.update({ where: { id: tagId }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "inbox.tag-deleted",
    entityType: "inbox_tag",
    entityId: tagId,
    before: { name: tag.name },
  });
}

/** The chat's tags become exactly these: added ones are linked, the others taken off. */
export async function setConversationTags(
  tx: OrgTx,
  access: MemberAccess,
  input: SetConversationTagsInput,
): Promise<void> {
  const chat = await tx.whatsappConversation.findFirst({
    where: { AND: [{ id: input.conversationId, state: "open" }, visibleConversations(access)] },
    select: { id: true },
  });
  if (chat === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const wanted = [...new Set(input.tagIds)];
  const live = await tx.inboxTag.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } });
  if (live.length !== wanted.length) throw new DomainError("NOT_FOUND", "NOT_FOUND", "A tag no longer exists");
  const current = await tx.conversationTag.findMany({
    where: { conversationId: chat.id },
    select: { tagId: true, tag: { select: { name: true } } },
  });
  const had = new Set(current.map((link) => link.tagId));
  const adding = wanted.filter((id) => !had.has(id));
  const removing = current.filter((link) => !wanted.includes(link.tagId)).map((link) => link.tagId);
  if (adding.length === 0 && removing.length === 0) return;
  if (removing.length > 0) {
    await tx.conversationTag.deleteMany({ where: { conversationId: chat.id, tagId: { in: removing } } });
  }
  if (adding.length > 0) {
    await tx.conversationTag.createMany({
      data: adding.map((tagId) => ({ conversationId: chat.id, tagId, createdBy: access.userId })),
      skipDuplicates: true,
    });
  }
  await recordAudit(tx, access, {
    action: "inbox.chat-tagged",
    entityType: "whatsapp_conversation",
    entityId: chat.id,
    before: {
      tags: current
        .map((link) => link.tag.name)
        .sort()
        .join(", "),
    },
    after: {
      tags: live
        .map((tag) => tag.name)
        .sort()
        .join(", "),
    },
  });
}
