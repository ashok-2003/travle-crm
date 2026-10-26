// What the inbox screens read (spec 3.1, 3.2, 6.3): the list of chats, one chat's header, a page of its messages, the chat of
// a lead's person, and the status. Reads are views: the member's inbox:view scope (and, for "own", their leads:view scope)
// decides which chats exist for them; a chat out of scope is "not found". Nothing here holds MSG91's key or a provider link.
import {
  conversationHeader,
  conversationPage,
  chatMessagePage,
  inboxStatus,
  whatsappMessageKind,
  whatsappMessageStatus,
  type ChatMessagePage,
  type ConversationHeader,
  type ConversationPage,
  type InboxStatus,
  type ListConversationsInput,
  type ListMessagesInput,
} from "@travel-crm/contracts/inbox";
import { openLeadStages } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { assertRecordInScope, type MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { chatNameOf } from "./chat-name.js";
import { liveConnection } from "./connection-row.js";
import { previewOf } from "./messages.js";
import { unreadCounts, unreadIdsOf } from "./unread.js";
import { visibleConversations, type ConversationWhere } from "./scope.js";
import { whatsappConsentOf } from "./whatsapp-consent.js";
import { windowEndOf } from "./window.js";

/** Whether WhatsApp is on for this server and the agency has a number (3.1's states). */
export async function inboxStatusOf(tx: OrgTx, configured: boolean): Promise<InboxStatus> {
  const connection = await liveConnection(tx);
  return inboxStatus.parse({
    configured,
    connected: connection !== null && connection.status !== "setup",
    connectionStatus: connection?.status ?? null,
    demo: connection?.mode === "demo",
    number: connection?.displayNumber ?? null,
  });
}

/** The leads a member's `leads:view` scope shows: all, their own, or none. */
function leadScopeWhere(access: MemberAccess): { ownerUserId?: string; id?: { in: string[] } } {
  const scope = access.permissions.scopeOf("leads:view");
  if (scope === "all") return {};
  return scope === "own" ? { ownerUserId: access.userId } : { id: { in: [] } };
}

const DAY_MS = 86_400_000;
/** Where the "Any time" filter's period starts: a day, 7 days or 30 days before now. */
const periodStart = (period: NonNullable<ListConversationsInput["period"]>, now: Date) =>
  new Date(now.getTime() - (period === "today" ? 1 : period === "week" ? 7 : 30) * DAY_MS);

const digitsOf = (text: string) => text.replace(/\D/g, "");

function searchWhere(search: string): ConversationWhere {
  const digits = digitsOf(search);
  const byPhone: ConversationWhere[] = digits.length >= 4 ? [{ phoneE164: { contains: digits } }] : [];
  return {
    OR: [
      { person: { is: { name: { contains: search, mode: "insensitive" } } } },
      { profileName: { contains: search, mode: "insensitive" } },
      ...byPhone,
    ],
  };
}

/** Chats neither archived nor snoozed past now: what every list but Archived and Snoozed shows. */
export const awakeWhere = (now: Date): ConversationWhere => ({
  archivedAt: null,
  OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
});

async function filterWhere(
  tx: OrgTx,
  access: MemberAccess,
  filter: ListConversationsInput["filter"],
  now: Date,
): Promise<ConversationWhere> {
  if (filter === "archived") return { archivedAt: { not: null } };
  if (filter === "snoozed") return { archivedAt: null, snoozedUntil: { gt: now } };
  if (filter === "unread") return { AND: [awakeWhere(now), { id: { in: await unreadIdsOf(tx, access) } }] };
  return { AND: [awakeWhere(now), presetWhere(access, filter)] };
}

export function presetWhere(access: MemberAccess, filter: ListConversationsInput["filter"]): ConversationWhere {
  if (filter === "waiting") return { needsReply: true };
  if (filter === "mine") return { person: { is: { leads: { some: { ownerUserId: access.userId } } } } };
  if (filter === "unassigned") {
    return { person: { is: { leads: { some: { ownerUserId: null, stage: { in: [...openLeadStages] } } } } } };
  }
  return {};
}

const isOpenStage = (stage: string) => (openLeadStages as readonly string[]).includes(stage);

/** For each person, the lead their chat is about: the most recently active open lead, else the latest, in the member's scope. */
async function chatLeadsOf(tx: OrgTx, access: MemberAccess, personIds: string[]) {
  const leads =
    personIds.length === 0
      ? []
      : await tx.lead.findMany({
          where: { personId: { in: personIds }, ...leadScopeWhere(access) },
          orderBy: { id: "desc" },
          select: { id: true, personId: true, stage: true, ownerUserId: true, updatedAt: true },
        });
  const chosen = new Map<string, (typeof leads)[number]>();
  for (const lead of leads) {
    const held = chosen.get(lead.personId);
    const better =
      held === undefined ||
      (isOpenStage(lead.stage) && !isOpenStage(held.stage)) ||
      (isOpenStage(lead.stage) === isOpenStage(held.stage) &&
        isOpenStage(lead.stage) &&
        lead.updatedAt.getTime() > held.updatedAt.getTime());
    if (better) chosen.set(lead.personId, lead);
  }
  return chosen;
}

/** The lead a chat is about for this member (what the chat's header and notes use), or null when there is none in their scope. */
export async function leadOfChat(tx: OrgTx, access: MemberAccess, personId: string | null) {
  if (personId === null) return null;
  return (await chatLeadsOf(tx, access, [personId])).get(personId) ?? null;
}

/** A page of chats, the newest message first, with the chats waiting for a reply as the default filter. */
export async function listConversations(
  tx: OrgTx,
  access: MemberAccess,
  input: ListConversationsInput,
  now: Date = new Date(),
): Promise<ConversationPage> {
  const after =
    input.before === undefined
      ? null
      : await tx.whatsappConversation.findUnique({
          where: { id: input.before },
          select: { id: true, lastMessageAt: true },
        });
  const keyset: ConversationWhere[] =
    after === null
      ? []
      : after.lastMessageAt === null
        ? // Chats with no message come first (Postgres puts nulls first when descending); then every chat that has one.
          [{ OR: [{ lastMessageAt: null, id: { lt: after.id } }, { lastMessageAt: { not: null } }] }]
        : [
            {
              OR: [
                { lastMessageAt: { lt: after.lastMessageAt } },
                { lastMessageAt: after.lastMessageAt, id: { lt: after.id } },
              ],
            },
          ];
  const base: ConversationWhere[] = [
    { hidden: false, state: "open" },
    visibleConversations(access),
    await filterWhere(tx, access, input.filter, now),
    ...(input.search === undefined ? [] : [searchWhere(input.search)]),
    ...(input.tagId === undefined ? [] : [{ tags: { some: { tagId: input.tagId } } }]),
    ...(input.stage === undefined
      ? []
      : [{ person: { is: { leads: { some: { deletedAt: null, stage: input.stage, ...leadScopeWhere(access) } } } } }]),
    ...(input.period === undefined ? [] : [{ lastMessageAt: { gte: periodStart(input.period, now) } }]),
  ];
  const select = {
    id: true,
    phoneE164: true,
    profileName: true,
    personId: true,
    lastMessageAt: true,
    lastMessageId: true,
    needsReply: true,
    pinnedAt: true,
    archivedAt: true,
    lastInboundAt: true,
    snoozedUntil: true,
    person: { select: { name: true } },
    tags: { select: { tag: { select: { id: true, name: true } } } },
  } as const;
  // Pinned chats head the first page (sales inbox spec 5); the pages after it are the rest, newest first.
  const pinned =
    input.before === undefined && input.filter !== "archived"
      ? await tx.whatsappConversation.findMany({
          where: { AND: [...base, { pinnedAt: { not: null } }] },
          orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
          take: 20,
          select,
        })
      : [];
  const rows = await tx.whatsappConversation.findMany({
    where: { AND: [...base, ...(input.filter === "archived" ? [] : [{ pinnedAt: null }]), ...keyset] },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select,
  });
  const page = [...pinned, ...rows.slice(0, input.limit)];
  const lastIds = page.map((row) => row.lastMessageId).filter((id): id is string => id !== null);
  const lasts = await tx.whatsappMessage.findMany({
    where: { id: { in: lastIds } },
    select: { id: true, kind: true, body: true, caption: true, direction: true, status: true },
  });
  const lastById = new Map(lasts.map((message) => [message.id, message]));
  const leadByPerson = await chatLeadsOf(
    tx,
    access,
    page.map((row) => row.personId).filter((id): id is string => id !== null),
  );
  const unread = await unreadCounts(
    tx,
    access,
    page.map((row) => row.id),
  );
  return conversationPage.parse({
    items: page.map((row) => {
      const last = row.lastMessageId === null ? undefined : lastById.get(row.lastMessageId);
      const lead = row.personId === null ? undefined : leadByPerson.get(row.personId);
      return {
        lastDirection: last?.direction === "in" || last?.direction === "out" ? last.direction : null,
        lastStatus: last === undefined ? null : whatsappMessageStatus.catch("received").parse(last.status),
        lead: lead === undefined ? null : { id: lead.id, stage: lead.stage, ownerUserId: lead.ownerUserId },
        tags: row.tags.map((link) => link.tag).sort((a, b) => a.name.localeCompare(b.name)),
        pinned: row.pinnedAt !== null,
        archived: row.archivedAt !== null,
        unread: unread.get(row.id) ?? 0,
        waitingSince: row.needsReply && row.lastInboundAt !== null ? row.lastInboundAt.toISOString() : null,
        snoozedUntil:
          row.snoozedUntil !== null && row.snoozedUntil.getTime() > now.getTime()
            ? row.snoozedUntil.toISOString()
            : null,
        id: row.id,
        phone: row.phoneE164,
        name: chatNameOf(row),
        personId: row.personId,
        preview: last === undefined ? "" : previewOf(last),
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        needsReply: row.needsReply,
        isNewNumber: row.personId === null,
      };
    }),
    nextCursor: rows.length > input.limit ? (rows[input.limit - 1]?.id ?? null) : null,
  });
}

/** The chat if the member may see it, else "not found". */
export async function visibleConversation(tx: OrgTx, access: MemberAccess, conversationId: string) {
  const row = await tx.whatsappConversation.findFirst({
    where: { AND: [{ id: conversationId }, visibleConversations(access)] },
    select: {
      id: true,
      connectionId: true,
      phoneE164: true,
      profileName: true,
      personId: true,
      lastInboundAt: true,
      needsReply: true,
      state: true,
      hidden: true,
      pinnedAt: true,
      archivedAt: true,
      snoozedUntil: true,
      person: { select: { name: true } },
      tags: { select: { tag: { select: { id: true, name: true } } } },
    },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  return row;
}

/** The chat's header (3.2): name, the lead it links to, whether a new lead can be started, and the window. */
export async function conversationHeaderOf(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
  now: Date,
): Promise<ConversationHeader> {
  const row = await visibleConversation(tx, access, conversationId);
  const leads =
    row.personId === null
      ? []
      : await tx.lead.findMany({
          // Only the leads this member may see: a salesperson who sees the chat through their own lead learns nothing of the
          // person's leads owned by others.
          where: { personId: row.personId, ...leadScopeWhere(access) },
          orderBy: { id: "desc" },
          select: {
            id: true,
            stage: true,
            ownerUserId: true,
            updatedAt: true,
            travelMonth: true,
            destination: { select: { name: true } },
          },
        });
  const isOpen = (stage: string) => (openLeadStages as readonly string[]).includes(stage);
  // Their most recently active open lead is the one whose trip fills a template.
  const active = leads
    .filter((lead) => isOpen(lead.stage))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  // The lead the chat is about is the list's and the notes' own choice (see chatLeadsOf), so all three name one lead.
  const chosen = await leadOfChat(tx, access, row.personId);
  const shown = leads.find((lead) => lead.id === chosen?.id) ?? null;
  const windowEnd = windowEndOf(row.lastInboundAt);
  const consent = row.personId === null ? { state: null, source: null } : await whatsappConsentOf(tx, row.personId);
  return conversationHeader.parse({
    id: row.id,
    phone: row.phoneE164,
    name: chatNameOf(row),
    personId: row.personId,
    lead:
      shown === null
        ? null
        : { id: shown.id, stage: shown.stage, ownerUserId: shown.ownerUserId, open: isOpen(shown.stage) },
    pastCustomer: leads.length > 0 && !leads.some((lead) => isOpen(lead.stage)),
    windowOpenUntil: windowEnd !== null && windowEnd.getTime() > now.getTime() ? windowEnd.toISOString() : null,
    lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
    needsReply: row.needsReply,
    trip: {
      destination: active?.destination?.name ?? null,
      travelMonth: active?.travelMonth?.toISOString().slice(0, 10) ?? null,
    },
    optedOut: consent.state === "withdrawn" && consent.source === "customer",
    agreed: consent.state === "granted",
    state: row.state === "erased" ? "erased" : "open",
    tags: row.tags.map((link) => link.tag).sort((a, b) => a.name.localeCompare(b.name)),
    pinned: row.pinnedAt !== null,
    archived: row.archivedAt !== null,
    snoozedUntil:
      row.snoozedUntil !== null && row.snoozedUntil.getTime() > now.getTime() ? row.snoozedUntil.toISOString() : null,
    // The api adds who is typing: it alone knows (kept in its memory, never stored).
    replying: [],
  });
}

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

/** The chat of the person a lead belongs to, if the member may see both; null when there is none yet. */
export async function leadChatOf(
  tx: OrgTx,
  access: MemberAccess,
  leadId: string,
): Promise<{ conversationId: string } | null> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { ownerUserId: true, personId: true } });
  if (lead === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  assertRecordInScope(access, "leads:view", lead.ownerUserId);
  const chat = await tx.whatsappConversation.findFirst({
    where: { AND: [{ personId: lead.personId, hidden: false, state: "open" }, visibleConversations(access)] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  return chat === null ? null : { conversationId: chat.id };
}

/** The message's file to show, if the member may see the chat. */
export async function visibleMessage(tx: OrgTx, access: MemberAccess, messageId: string) {
  const message = await tx.whatsappMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, mediaState: true, fileName: true },
  });
  if (message === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await visibleConversation(tx, access, message.conversationId);
  return message;
}
