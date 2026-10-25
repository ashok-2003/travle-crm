// The agency's automatic answers (sales inbox spec 6): a welcome to a number writing for the first time, a keyword's
// answer ("price" → the price list), and an away message outside working hours (once in 12 hours per chat). They are
// written by the Owner and Admins (inbox:templates) and sent by the worker when a customer writes, inside the 24-hour
// window the customer just opened, through the ordinary outbox; the chat keeps waiting for a person's reply.
import {
  inboxAutomation,
  keywordReplyList,
  keywordReply,
  type CreateKeywordReplyInput,
  type InboxAutomation,
  type KeywordReply,
  type SaveInboxAutomationInput,
  whatsappCustomerWroteEvent,
} from "@travel-crm/contracts/inbox";
import { isUniqueViolation, softDeleted, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { queueSystemText } from "./system-send.js";

/** Published for every new message a customer writes (not a reaction, not a blocked contact's). */
export const CUSTOMER_WROTE_EVENT = "whatsapp.customer-wrote";

const AWAY_GAP_MS = 12 * 3_600_000;
const defaults: InboxAutomation = {
  awayEnabled: false,
  awayMessage: "",
  openFrom: 600,
  openUntil: 1140,
  openDays: [1, 2, 3, 4, 5, 6],
  welcomeEnabled: false,
  welcomeMessage: "",
};
const automationFields = {
  awayEnabled: true,
  awayMessage: true,
  openFrom: true,
  openUntil: true,
  openDays: true,
  welcomeEnabled: true,
  welcomeMessage: true,
} as const;

export async function automationOf(tx: OrgTx): Promise<InboxAutomation> {
  const row = await tx.inboxAutomation.findFirst({ select: automationFields });
  return inboxAutomation.parse(row ?? defaults);
}

export async function saveAutomation(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveInboxAutomationInput,
): Promise<InboxAutomation> {
  const before = await automationOf(tx);
  const data = { ...input, openDays: [...new Set(input.openDays)].sort(), updatedBy: access.userId };
  const existing = await tx.inboxAutomation.findFirst({ select: { id: true } });
  const row =
    existing === null
      ? await tx.inboxAutomation.create({ data, select: automationFields })
      : await tx.inboxAutomation.update({ where: { id: existing.id }, data, select: automationFields });
  await recordAudit(tx, access, {
    action: "inbox.automation-changed",
    entityType: "inbox_automation",
    entityId: existing?.id ?? access.organizationId,
    before: { away: before.awayEnabled, welcome: before.welcomeEnabled },
    after: { away: row.awayEnabled, welcome: row.welcomeEnabled },
  });
  return inboxAutomation.parse(row);
}

const keywordFields = { id: true, keyword: true, reply: true, enabled: true } as const;

export async function listKeywordReplies(tx: OrgTx): Promise<KeywordReply[]> {
  return keywordReplyList.parse(
    await tx.inboxKeywordReply.findMany({ orderBy: { keyword: "asc" }, select: keywordFields }),
  );
}

export async function createKeywordReply(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateKeywordReplyInput,
): Promise<KeywordReply> {
  const taken = () => new DomainError("CONFLICT", "KEYWORD_TAKEN", "This word already has an answer");
  if ((await tx.inboxKeywordReply.findFirst({ where: { keyword: input.keyword }, select: { id: true } })) !== null) {
    throw taken();
  }
  try {
    const row = await tx.inboxKeywordReply.create({
      data: { ...input, createdBy: access.userId },
      select: keywordFields,
    });
    await recordAudit(tx, access, {
      action: "inbox.keyword-reply-created",
      entityType: "inbox_keyword_reply",
      entityId: row.id,
      after: { keyword: row.keyword },
    });
    return keywordReply.parse(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw taken();
    throw error;
  }
}

export async function deleteKeywordReply(tx: OrgTx, access: MemberAccess, keywordReplyId: string): Promise<void> {
  const row = await tx.inboxKeywordReply.findUnique({ where: { id: keywordReplyId }, select: keywordFields });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await tx.inboxKeywordReply.update({ where: { id: row.id }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "inbox.keyword-reply-deleted",
    entityType: "inbox_keyword_reply",
    entityId: row.id,
    before: { keyword: row.keyword },
  });
}

/** Whether the office is open at a moment, by the agency's hours in its own time zone. */
export function isOpenAt(settings: InboxAutomation, at: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  const minute = Number(value("hour")) * 60 + Number(value("minute"));
  return settings.openDays.includes(day) && minute >= settings.openFrom && minute < settings.openUntil;
}

/** The first keyword answer whose word stands as a whole word in the text, in any case. */
export function keywordAnswerFor(text: string, replies: KeywordReply[]): KeywordReply | undefined {
  const words = new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word !== ""),
  );
  return replies.find((reply) => reply.enabled && words.has(reply.keyword));
}

/** The worker's listener: when a customer writes, the one automatic answer that fits, if any. Safe to run twice. */
export function automationListener(dependencies: {
  timeZone: (organizationId: string) => Promise<string>;
}): EventListener {
  return defineListener({
    name: "inbox.automatic-answers",
    eventType: CUSTOMER_WROTE_EVENT,
    payload: whatsappCustomerWroteEvent,
    handle: async (event, context) => {
      const timeZone = await dependencies.timeZone(event.organizationId);
      await context.forOrg(async (tx) => {
        const settings = await automationOf(tx);
        const message = await tx.whatsappMessage.findUnique({
          where: { id: event.payload.messageId },
          select: { body: true, caption: true, occurredAt: true },
        });
        if (message === null) return;
        const send = (body: string, kind: string) =>
          queueSystemText(
            tx,
            {
              conversationId: event.payload.conversationId,
              body,
              sentBy: null,
              clientToken: `auto:${kind}:${event.id}`,
              answers: false,
            },
            new Date(),
          );
        if (event.payload.firstEver && settings.welcomeEnabled && settings.welcomeMessage !== "") {
          await send(settings.welcomeMessage, "welcome");
          return;
        }
        const keyword = keywordAnswerFor(message.body ?? message.caption ?? "", await listKeywordReplies(tx));
        if (keyword !== undefined) {
          await send(keyword.reply, "keyword");
          return;
        }
        if (!settings.awayEnabled || settings.awayMessage === "" || isOpenAt(settings, message.occurredAt, timeZone)) {
          return;
        }
        // Once in 12 hours a chat: a customer writing five lines at night gets one away message.
        const recent = await tx.whatsappMessage.findFirst({
          where: {
            conversationId: event.payload.conversationId,
            clientToken: { startsWith: "auto:away:" },
            occurredAt: { gt: new Date(Date.now() - AWAY_GAP_MS) },
          },
          select: { id: true },
        });
        if (recent === null) await send(settings.awayMessage, "away");
      });
    },
  });
}
