// Sending a trip's details to a chat (sales inbox, trip details): its words first, then each of its files as a message of
// its own, through the ordinary outbox. A file is copied inside storage onto the message that sends it, so the trip keeps
// its own. A member sends from the chat's Send details; the worker sends a trip by itself when a customer's message holds
// one of its keywords, once a chat. Every piece has a token made from the send's, so a repeat (a double tap, a job run
// twice) queues nothing twice and copies no file twice.
import { createHash } from "node:crypto";
import { TRIP_KIT_RECORD_TYPE, WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import {
  tripKitSent,
  whatsappCustomerWroteEvent,
  whatsappSendContentTypes,
  type SendTripKitInput,
  type TripKitSent,
} from "@travel-crm/contracts/inbox";
import { isUniqueViolation, type Database, type OrgTx } from "@travel-crm/db";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { CUSTOMER_WROTE_EVENT } from "./automation.js";
import { kindOf, sendableChat, type ReplyContext } from "./outbox.js";
import { queueSystemText, type SystemSendResult } from "./system-send.js";
import { isOptOutText, whatsappConsentOf } from "./whatsapp-consent.js";

export interface TripKitSendDependencies {
  db: Database;
  files: Files;
}

/** Words as matched: lower case, one space between, nothing but letters and digits. */
const wordsOf = (text: string) =>
  ` ${text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "")
    .join(" ")} `;

/** An id made from a send's token, so asking again names the same one (a uuid: version 8, the custom one). */
function idFromToken(token: string): string {
  const bytes = createHash("sha256").update(token).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The first trip set to send itself whose keyword (a word or a phrase) stands whole in the text. */
export function tripKitFor<Kit extends { keywords: string[] }>(text: string, kits: readonly Kit[]): Kit | undefined {
  const words = wordsOf(text);
  return kits.find((kit) =>
    kit.keywords.some((keyword) => wordsOf(keyword).trim() !== "" && words.includes(wordsOf(keyword))),
  );
}

interface Delivery {
  conversationId: string;
  tripKitId: string;
  /** What every piece's client token starts with: the same for a repeat of the same send. */
  token: string;
  sentBy: string | null;
  origin: "staff_crm" | "automation";
  answers: boolean;
}

/** Queues a trip's words and files; how many went, and why none did when none did. */
async function deliver(
  { db, files }: TripKitSendDependencies,
  actor: Actor,
  delivery: Delivery,
  now: Date,
): Promise<TripKitSent> {
  const kit = await db.forOrg(actor.organizationId, (tx) =>
    tx.tripKit.findUnique({ where: { id: delivery.tripKitId }, select: { id: true, message: true } }),
  );
  if (kit === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const sendable: readonly string[] = whatsappSendContentTypes;
  const held = (await files.list(actor, { recordType: TRIP_KIT_RECORD_TYPE, recordId: kit.id })).filter((file) =>
    sendable.includes(file.contentType),
  );
  const common = {
    conversationId: delivery.conversationId,
    sentBy: delivery.sentBy,
    origin: delivery.origin,
    answers: delivery.answers,
  };
  const results: SystemSendResult[] = [];
  if (kit.message !== "") {
    results.push(
      await db.forOrg(actor.organizationId, (tx) =>
        queueSystemText(tx, { ...common, body: kit.message, clientToken: `${delivery.token}:words` }, now),
      ),
    );
  }
  for (const file of held) {
    // A refusal for the words (the window closed) refuses the files too; no copy is made for nothing.
    if (results.some((result) => !result.ok)) break;
    const clientToken = `${delivery.token}:file:${file.id}`;
    // Sent already (this is a repeat): no second copy of the file.
    const earlier = await db.forOrg(actor.organizationId, (tx) =>
      tx.whatsappMessage.findFirst({ where: { clientToken }, select: { id: true } }),
    );
    if (earlier !== null) {
      results.push({ ok: true, messageId: earlier.id });
      continue;
    }
    // Named by the send's token, so a retry copies into the same message's file and never makes a second copy.
    const messageId = idFromToken(clientToken);
    await files.copyFile(
      actor,
      { recordType: TRIP_KIT_RECORD_TYPE, recordId: kit.id, attachmentId: file.id },
      { recordType: WHATSAPP_RECORD_TYPE, recordId: messageId },
    );
    results.push(
      await db.forOrg(actor.organizationId, (tx) =>
        queueSystemText(
          tx,
          {
            ...common,
            body: "",
            clientToken,
            media: { messageId, kind: kindOf(file.contentType), fileName: file.fileName },
          },
          now,
        ),
      ),
    );
  }
  const queued = results.filter((result) => result.ok).length;
  const refusal = results.find((result) => !result.ok);
  return tripKitSent.parse({
    queued,
    refused: queued > 0 || refusal === undefined ? null : refusal.code,
  });
}

/** A member sends a trip's details to a chat they may reply in, from its Send details. */
export async function sendTripKit(
  dependencies: TripKitSendDependencies,
  access: MemberAccess,
  input: SendTripKitInput,
  context: ReplyContext,
  now: Date,
): Promise<TripKitSent> {
  // The member's own checks (the chat is theirs to see, the number connected, the window open) say why, as a reply's do.
  await dependencies.db.forOrg(access.organizationId, (tx) =>
    sendableChat(tx, access, input.conversationId, context, now),
  );
  const sent = await deliver(
    dependencies,
    access,
    {
      conversationId: input.conversationId,
      tripKitId: input.tripKitId,
      token: `kit:${input.clientToken}`,
      sentBy: access.userId,
      origin: "staff_crm",
      answers: true,
    },
    now,
  );
  if (sent.queued > 0) {
    await dependencies.db.forOrg(access.organizationId, (tx) =>
      recordSend(tx, { ...input, source: "manual", sentBy: access.userId, messages: sent.queued }),
    );
  }
  return sent;
}

async function recordSend(
  tx: OrgTx,
  send: {
    tripKitId: string;
    conversationId: string;
    source: "manual" | "keyword";
    sentBy: string | null;
    messages: number;
  },
): Promise<void> {
  try {
    await tx.tripKitSend.create({
      data: {
        tripKitId: send.tripKitId,
        conversationId: send.conversationId,
        source: send.source,
        sentBy: send.sentBy,
        messages: send.messages,
      },
    });
  } catch (error) {
    // The keyword's send was recorded by a run before this one.
    if (!isUniqueViolation(error)) throw error;
  }
}

/** When a customer's message holds a trip's keyword, the trip's details go to the chat by themselves, once a chat. */
export async function sendTripKitOnKeyword(
  dependencies: TripKitSendDependencies,
  actor: Actor,
  input: { conversationId: string; messageId: string },
  now: Date,
): Promise<boolean> {
  const chosen = await dependencies.db.forOrg(actor.organizationId, async (tx) => {
    const message = await tx.whatsappMessage.findUnique({
      where: { id: input.messageId },
      select: { body: true, caption: true },
    });
    const text = message?.body ?? message?.caption ?? null;
    // Someone asking to stop is never answered, and nobody who withdrew their consent is written to.
    if (text === null || isOptOutText(text)) return null;
    const chat = await tx.whatsappConversation.findUnique({
      where: { id: input.conversationId },
      select: { personId: true },
    });
    if (chat === null) return null;
    if (chat.personId !== null && (await whatsappConsentOf(tx, chat.personId)).state === "withdrawn") return null;
    const sentHere = await tx.tripKitSend.findMany({
      where: { conversationId: input.conversationId, source: "keyword" },
      select: { tripKitId: true },
    });
    const kits = await tx.tripKit.findMany({
      where: { autoSend: true, id: { notIn: sentHere.map((send) => send.tripKitId) } },
      orderBy: { name: "asc" },
      select: { id: true, keywords: true },
    });
    return tripKitFor(text, kits) ?? null;
  });
  if (chosen === null) return false;
  const sent = await deliver(
    dependencies,
    actor,
    {
      conversationId: input.conversationId,
      tripKitId: chosen.id,
      // The chat's and the trip's: once a chat, whichever message held the keyword.
      token: `kit:auto:${input.conversationId}:${chosen.id}`,
      sentBy: null,
      origin: "automation",
      answers: false,
    },
    now,
  );
  if (sent.queued === 0) return false;
  await dependencies.db.forOrg(actor.organizationId, (tx) =>
    recordSend(tx, {
      tripKitId: chosen.id,
      conversationId: input.conversationId,
      source: "keyword",
      sentBy: null,
      messages: sent.queued,
    }),
  );
  return true;
}

/** The worker's listener: a customer's message holding a trip's keyword sends the trip, once a chat. Safe to run twice. */
export function tripKitKeywordListener(dependencies: TripKitSendDependencies): EventListener {
  return defineListener({
    name: "inbox.trip-kit-keywords",
    eventType: CUSTOMER_WROTE_EVENT,
    payload: whatsappCustomerWroteEvent,
    handle: async (event, context) => {
      await sendTripKitOnKeyword(
        dependencies,
        context.actor,
        { conversationId: event.payload.conversationId, messageId: event.payload.messageId },
        new Date(),
      );
    },
  });
}
