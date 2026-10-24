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

function filterWhere(access: MemberAccess, filter: ListConversationsInput["filter"]): ConversationWhere {
  if (filter === "waiting") return { needsReply: true };
  if (filter === "mine") return { person: { is: { leads: { some: { ownerUserId: access.userId } } } } };
  return {};
}

/** A page of chats, the newest message first, with the chats waiting for a reply as the default filter. */
export async function listConversations(
  tx: OrgTx,
  access: MemberAccess,
  input: ListConversationsInput,
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
        ? [{ lastMessageAt: null, id: { lt: after.id } }]
        : [
            {
              OR: [
                { lastMessageAt: { lt: after.lastMessageAt } },
                { lastMessageAt: after.lastMessageAt, id: { lt: after.id } },
                { lastMessageAt: null },
              ],
            },
          ];
  const rows = await tx.whatsappConversation.findMany({
    where: {
      AND: [
        { hidden: false, state: "open" },
        visibleConversations(access),
        filterWhere(access, input.filter),
        ...(input.search === undefined ? [] : [searchWhere(input.search)]),
        ...keyset,
      ],
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      phoneE164: true,
      profileName: true,
      personId: true,
      lastMessageAt: true,
      lastMessageId: true,
      needsReply: true,
      person: { select: { name: true } },
    },
  });
  const page = rows.slice(0, input.limit);
  const lastIds = page.map((row) => row.lastMessageId).filter((id): id is string => id !== null);
  const lasts = await tx.whatsappMessage.findMany({
    where: { id: { in: lastIds } },
    select: { id: true, kind: true, body: true, caption: true },
  });
  const lastById = new Map(lasts.map((message) => [message.id, message]));
  return conversationPage.parse({
    items: page.map((row) => {
      const last = row.lastMessageId === null ? undefined : lastById.get(row.lastMessageId);
      return {
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
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
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
      person: { select: { name: true } },
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
          where: { personId: row.personId },
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
  const shown = leads.find((lead) => isOpen(lead.stage)) ?? leads[0] ?? null;
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
  });
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
      ...(after === null
        ? {}
        : { OR: [{ occurredAt: { lt: after.occurredAt } }, { occurredAt: after.occurredAt, id: { lt: after.id } }] }),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  const quotedWamids = page.map((row) => row.quotedWamid).filter((wamid): wamid is string => wamid !== null);
  const quoted = await tx.whatsappMessage.findMany({
    where: { conversationId: input.conversationId, wamid: { in: quotedWamids } },
    select: { wamid: true, kind: true, body: true, caption: true },
  });
  const quotedByWamid = new Map(quoted.map((message) => [message.wamid, message]));
  return chatMessagePage.parse({
    items: page.map((row) => {
      const target = row.quotedWamid === null ? undefined : quotedByWamid.get(row.quotedWamid);
      return {
        id: row.id,
        direction: row.direction,
        origin: row.origin,
        kind: whatsappMessageKind.catch("unsupported").parse(row.kind),
        body: row.body,
        caption: row.caption,
        fileName: row.fileName,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        quoted: target === undefined ? null : { kind: target.kind, body: target.body ?? target.caption },
        reaction: row.reaction,
        status: whatsappMessageStatus.catch("received").parse(row.status),
        failureCode: row.failureCode,
        mediaState: row.mediaState,
        sentBy: row.sentBy,
        occurredAt: row.occurredAt.toISOString(),
      };
    }),
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
