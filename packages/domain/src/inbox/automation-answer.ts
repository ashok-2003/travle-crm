// The automatic answers, decided when a customer writes (sales inbox spec 6, owner decision 3 of 2026-10-26): a welcome to a
// number writing for the first time, a keyword's answer, and an away message outside working hours. Each is written as
// "automation" (never as staff) through the ordinary outbox, inside the 24-hour window the customer just opened, and leaves
// the chat waiting for a person's reply. Never an answer to STOP, never to someone whose WhatsApp consent is withdrawn, at most
// one of each kind per chat per cooldown (a welcome once per chat), and none in a chat where a person replied within the
// cooldown. Safe to run twice: the client token is the event's, so a repeat adds nothing.
import { whatsappCustomerWroteEvent, type InboxAutomation, type KeywordReply } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { defineListener, type EventListener } from "../jobs/index.js";
import { automationOf, CUSTOMER_WROTE_EVENT, listKeywordReplies } from "./automation.js";
import { queueSystemText } from "./system-send.js";
import { isOptOutText, whatsappConsentOf } from "./whatsapp-consent.js";

/** How long a chat goes without the same kind of automatic answer, and without any once a person has replied there. */
export const AUTOMATION_COOLDOWN_MS = 12 * 3_600_000;

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

export type AutomaticAnswer = "welcome" | "keyword" | "away" | "none";

/** Decides and queues the one automatic answer that fits a message the customer just wrote, if any. */
export async function answerAutomatically(
  tx: OrgTx,
  input: { conversationId: string; messageId: string; eventId: string; firstEver: boolean; timeZone: string },
  now: Date,
): Promise<AutomaticAnswer> {
  const message = await tx.whatsappMessage.findUnique({
    where: { id: input.messageId },
    select: { body: true, caption: true, occurredAt: true },
  });
  const text = message?.body ?? message?.caption ?? null;
  // Someone asking to stop is never answered, by any rule.
  if (message === null || isOptOutText(text)) return "none";
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: input.conversationId },
    select: { personId: true },
  });
  if (chat === null) return "none";
  if (chat.personId !== null && (await whatsappConsentOf(tx, chat.personId)).state === "withdrawn") return "none";
  const since = new Date(now.getTime() - AUTOMATION_COOLDOWN_MS);
  // Two messages decided at once share a token, so only one answer of a kind is made; the check below covers a bucket's edge.
  const bucket = Math.floor(now.getTime() / AUTOMATION_COOLDOWN_MS);
  // A person answered in this chat lately: the machine keeps quiet while they are at it.
  const person = await tx.whatsappMessage.findFirst({
    where: {
      conversationId: input.conversationId,
      direction: "out",
      origin: { in: ["staff_crm", "staff_phone"] },
      occurredAt: { gt: since },
    },
    select: { id: true },
  });
  if (person !== null) return "none";

  const send = async (kind: Exclude<AutomaticAnswer, "none">, body: string, token: string) => {
    const result = await queueSystemText(
      tx,
      {
        conversationId: input.conversationId,
        body,
        sentBy: null,
        origin: "automation",
        clientToken: token,
        answers: false,
      },
      now,
    );
    return result.ok ? kind : "none";
  };
  const settings = await automationOf(tx);
  // One of each kind per chat per cooldown; the welcome is once for the chat (its token is the chat's).
  const recent = async (kind: "keyword" | "away") =>
    (await tx.whatsappMessage.findFirst({
      where: {
        conversationId: input.conversationId,
        origin: "automation",
        clientToken: { startsWith: `auto:${kind}:` },
        status: { notIn: ["failed", "superseded"] },
        occurredAt: { gt: since },
      },
      select: { id: true },
    })) !== null;

  if (input.firstEver && settings.welcomeEnabled && settings.welcomeMessage !== "") {
    return send("welcome", settings.welcomeMessage, `auto:welcome:${input.conversationId}`);
  }
  const keyword = keywordAnswerFor(text ?? "", await listKeywordReplies(tx));
  if (keyword !== undefined) {
    return (await recent("keyword"))
      ? "none"
      : send("keyword", keyword.reply, `auto:keyword:${input.conversationId}:${String(bucket)}`);
  }
  if (!settings.awayEnabled || settings.awayMessage === "" || isOpenAt(settings, message.occurredAt, input.timeZone)) {
    return "none";
  }
  return (await recent("away"))
    ? "none"
    : send("away", settings.awayMessage, `auto:away:${input.conversationId}:${String(bucket)}`);
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
        await answerAutomatically(
          tx,
          {
            conversationId: event.payload.conversationId,
            messageId: event.payload.messageId,
            eventId: event.id,
            firstEver: event.payload.firstEver,
            timeZone,
          },
          new Date(),
        );
      });
    },
  });
}
