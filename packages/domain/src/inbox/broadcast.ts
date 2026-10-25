// A broadcast (sales inbox spec 6): one approved template to every chat with a tag, each sent through the ordinary
// template send, so consent, the opt-out, the marketing cap and the daily template cap all apply to each person; a chat
// refused by one of them is counted as skipped, never an error. At most 500 chats a broadcast. Written by the Owner and
// Admins (inbox:templates).
import { broadcastList, type BroadcastSummary, type CreateBroadcastInput } from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { noticeKey } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import type { ReplyContext } from "./outbox.js";
import { visibleConversations } from "./scope.js";
import { queueTemplate } from "./template-send.js";

export const MAX_BROADCAST_CHATS = 500;

async function taggedChats(tx: OrgTx, access: MemberAccess, tagId: string) {
  return tx.whatsappConversation.findMany({
    where: { AND: [{ hidden: false, state: "open", tags: { some: { tagId } } }, visibleConversations(access)] },
    orderBy: { id: "asc" },
    take: MAX_BROADCAST_CHATS,
    select: { id: true },
  });
}

/** How many chats carry the tag (what a broadcast to it would try). */
export async function broadcastReachOf(tx: OrgTx, access: MemberAccess, tagId: string) {
  const chats = await taggedChats(tx, access, tagId);
  return { chats: chats.length, allowed: chats.length };
}

export async function listBroadcasts(tx: OrgTx): Promise<BroadcastSummary[]> {
  const rows = await tx.whatsappBroadcast.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const templates = new Map(
    (
      await tx.whatsappTemplate.findMany({
        where: { id: { in: rows.map((row) => row.templateId) } },
        select: { id: true, name: true },
      })
    ).map((template) => [template.id, template.name]),
  );
  const tags = new Map(
    (
      await tx.inboxTag.findMany({
        where: { id: { in: rows.map((row) => row.tagId) } },
        select: { id: true, name: true },
      })
    ).map((tag) => [tag.id, tag.name]),
  );
  return broadcastList.parse(
    rows.map((row) => ({
      id: row.id,
      templateName: templates.get(row.templateId) ?? "",
      tagName: tags.get(row.tagId) ?? "",
      status: row.status,
      total: row.total,
      sent: row.sent,
      skipped: row.skipped,
      createdAt: row.createdAt.toISOString(),
    })),
  );
}

/**
 * Sends the broadcast now, in the request: the row first, then each chat in a transaction of its own, so one refusal
 * (no consent, a cap reached) skips that chat and the rest go on. Returns the finished summary.
 */
export async function sendBroadcast(
  db: Database,
  access: MemberAccess,
  input: CreateBroadcastInput,
  context: ReplyContext,
  now: Date,
): Promise<{ id: string; sent: number; skipped: number }> {
  const { broadcast, chats } = await db.forOrg(access.organizationId, async (tx) => {
    const template = await tx.whatsappTemplate.findUnique({
      where: { id: input.templateId },
      select: { id: true, name: true, status: true },
    });
    if (template?.status !== "approved") {
      throw new DomainError("CONFLICT", "TEMPLATE_NOT_APPROVED", "Only an approved template can be sent");
    }
    const tag = await tx.inboxTag.findUnique({ where: { id: input.tagId }, select: { id: true, name: true } });
    if (tag === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "The tag no longer exists");
    const found = await taggedChats(tx, access, tag.id);
    const row = await tx.whatsappBroadcast.create({
      data: {
        templateId: template.id,
        tagId: tag.id,
        params: input.params,
        status: "sending",
        total: found.length,
        createdBy: access.userId,
      },
      select: { id: true },
    });
    await recordAudit(tx, access, {
      action: "inbox.broadcast-sent",
      entityType: "whatsapp_broadcast",
      entityId: row.id,
      after: { template: template.name, tags: tag.name, total: found.length },
    });
    return { broadcast: row, chats: found };
  });
  let sent = 0;
  let skipped = 0;
  for (const chat of chats) {
    try {
      await db.forOrg(access.organizationId, async (tx) => {
        const queued = await queueTemplate(
          tx,
          access,
          {
            conversationId: chat.id,
            templateId: input.templateId,
            // The same token for the same chat of the same broadcast, so a retried request sends nothing twice.
            clientToken: noticeKey(broadcast.id, chat.id),
            parameters: input.params,
            agreed: false,
          },
          context,
          now,
        );
        await tx.whatsappMessage.update({ where: { id: queued.messageId }, data: { broadcastId: broadcast.id } });
      });
      sent += 1;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      skipped += 1;
    }
  }
  await db.forOrg(access.organizationId, (tx) =>
    tx.whatsappBroadcast.update({ where: { id: broadcast.id }, data: { status: "done", sent, skipped } }),
  );
  return { id: broadcast.id, sent, skipped };
}
