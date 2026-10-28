// A chat's messages as the screen reads them (spec 3.2): a page of them newest first, each quote resolved to its original,
// the customer's unread ones counted as the chat opens (for the divider), and the shaping the media gallery shares.
import {
  chatMessagePage,
  whatsappMessageKind,
  whatsappMessageStatus,
  type ChatMessagePage,
  type ListMessagesInput,
} from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { visibleConversation } from "./views.js";

type MessageRow = Awaited<ReturnType<OrgTx["whatsappMessage"]["findMany"]>>[number];

/** Message rows of one chat as the chat shows them, each quote resolved to its original. Shared with the media gallery. */
export async function chatMessagesOf(tx: OrgTx, conversationId: string, page: MessageRow[]) {
  // What each message quotes: a customer's reply names the original by WhatsApp's id, ours by our own.
  const quotedWamids = page
    .filter((row) => row.kind !== "reaction")
    .map((row) => row.quotedWamid)
    .filter((wamid): wamid is string => wamid !== null);
  const quotedIds = page.map((row) => row.quotedMessageId).filter((id): id is string => id !== null);
  const quoted = await tx.whatsappMessage.findMany({
    where: { conversationId: conversationId, OR: [{ wamid: { in: quotedWamids } }, { id: { in: quotedIds } }] },
    select: {
      id: true,
      wamid: true,
      direction: true,
      sentBy: true,
      kind: true,
      body: true,
      caption: true,
      fileName: true,
      mediaState: true,
    },
  });
  const quotedByWamid = new Map(quoted.map((message) => [message.wamid, message]));
  const quotedById = new Map(quoted.map((message) => [message.id, message]));
  const quoteOf = (row: (typeof page)[number]) => {
    if (row.kind === "reaction") return null;
    if (row.quotedMessageId === null && row.quotedWamid === null) return null;
    const target =
      row.quotedMessageId === null ? quotedByWamid.get(row.quotedWamid ?? "") : quotedById.get(row.quotedMessageId);
    if (target === undefined) {
      return {
        messageId: null,
        direction: null,
        sentBy: null,
        kind: null,
        body: null,
        fileName: null,
        mediaState: null,
      };
    }
    return {
      messageId: target.id,
      direction: target.direction,
      sentBy: target.sentBy,
      kind: whatsappMessageKind.catch("unsupported").parse(target.kind),
      body: target.body ?? target.caption,
      fileName: target.fileName,
      mediaState: target.mediaState,
    };
  };
  return page.map((row) => ({
    id: row.id,
    direction: row.direction,
    origin: row.origin,
    kind: whatsappMessageKind.catch("unsupported").parse(row.kind),
    body: row.body,
    caption: row.caption,
    fileName: row.fileName,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    quoted: quoteOf(row),
    quoteDropped: row.quoteDropped,
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    reaction: row.reaction,
    status: whatsappMessageStatus.catch("received").parse(row.status),
    failureCode: row.failureCode,
    mediaState: row.mediaState,
    sentBy: row.sentBy,
    occurredAt: row.occurredAt.toISOString(),
    starred: row.starredAt !== null,
  }));
}

/** The customer's messages the member has not read, with the first of them, as the chat is opened. */
async function unreadOnOpen(tx: OrgTx, access: MemberAccess, conversationId: string) {
  const mark = await tx.conversationRead.findUnique({
    where: {
      organizationId_conversationId_userId: {
        organizationId: access.organizationId,
        conversationId,
        userId: access.userId,
      },
    },
    select: { readAt: true },
  });
  const unread = {
    conversationId,
    direction: "in",
    kind: { not: "reaction" },
    status: { not: "superseded" },
    ...(mark === null ? {} : { occurredAt: { gt: mark.readAt } }),
  };
  const [count, first] = await Promise.all([
    tx.whatsappMessage.count({ where: unread }),
    tx.whatsappMessage.findFirst({
      where: unread,
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { id: true },
    }),
  ]);
  return { count: Math.min(count, 99), firstMessageId: first?.id ?? null };
}

/** A page of the chat's messages, newest first. */
export async function listMessages(
  tx: OrgTx,
  access: MemberAccess,
  input: ListMessagesInput,
): Promise<ChatMessagePage> {
  await visibleConversation(tx, access, input.conversationId);
  const after =
    input.before === undefined
      ? null
      : await tx.whatsappMessage.findFirst({
          where: { id: input.before, conversationId: input.conversationId },
          select: { id: true, occurredAt: true },
        });
  const rows = await tx.whatsappMessage.findMany({
    where: {
      conversationId: input.conversationId,
      status: { not: "superseded" },
      ...(input.starredOnly === true ? { starredAt: { not: null } } : {}),
      ...(input.search === undefined
        ? {}
        : {
            AND: [
              {
                OR: [
                  { body: { contains: input.search, mode: "insensitive" as const } },
                  { caption: { contains: input.search, mode: "insensitive" as const } },
                ],
              },
            ],
          }),
      ...(after === null
        ? {}
        : { OR: [{ occurredAt: { lt: after.occurredAt } }, { occurredAt: after.occurredAt, id: { lt: after.id } }] }),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  const unread =
    input.before === undefined && input.search === undefined && input.starredOnly !== true
      ? await unreadOnOpen(tx, access, input.conversationId)
      : null;
  return chatMessagePage.parse({
    unread,
    items: await chatMessagesOf(tx, input.conversationId, page),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
    people: {},
  });
}
