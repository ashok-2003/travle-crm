// The one rule for which number a WhatsApp send goes from (spec 2026-11-22-multi-number-whatsapp-design.md, section 5): in
// a chat, the chat's own number or not at all; to a customer outside a chat, the live number they last wrote to, else the
// main one. Every path that queues a message asks here which chat to write in. The worker sends each row from its chat's
// number, so choosing the chat is choosing the number.
import type { OrgTx } from "@travel-crm/db";
import { connectionById, mainConnection, type ConnectionRow } from "./connection-row.js";

export interface SendingChat {
  id: string;
  connectionId: string;
  phoneE164: string;
  personId: string | null;
  lastInboundAt: Date | null;
  hidden: boolean;
  state: string;
}

export type SendTarget = { chat: string } | { customer: { phoneE164: string; personId: string | null }; make: boolean };

export type SendFrom =
  | { ok: true; chat: SendingChat; connection: ConnectionRow }
  | { ok: false; code: "not_connected" | "paused" | "disconnected" | "none_yet" };

type Refusal = Extract<SendFrom, { ok: false }>;

const chatFields = {
  id: true,
  connectionId: true,
  phoneE164: true,
  personId: true,
  lastInboundAt: true,
  hidden: true,
  state: true,
} as const;

/** The number, if it can send now (rule 3): connected or with a problem; never paused, set up, a demo or disconnected. */
function usable(connection: ConnectionRow | null): Refusal | { ok: true; connection: ConnectionRow } {
  if (connection?.status === "disconnected") return { ok: false, code: "disconnected" };
  if (connection?.status === "paused") return { ok: false, code: "paused" };
  if (connection === null || connection.mode === "demo" || !["connected", "problem"].includes(connection.status)) {
    return { ok: false, code: "not_connected" };
  }
  return { ok: true, connection };
}

/** The customer's chat they last wrote in, on a number that isn't disconnected. */
const lastWrittenChat = (tx: OrgTx, phoneE164: string) =>
  tx.whatsappConversation.findFirst({
    where: { phoneE164, lastInboundAt: { not: null }, connection: { status: { not: "disconnected" } } },
    orderBy: [{ lastInboundAt: "desc" }, { id: "desc" }],
    select: chatFields,
  });

const chatOn = (tx: OrgTx, connectionId: string, phoneE164: string) =>
  tx.whatsappConversation.findFirst({ where: { connectionId, phoneE164 }, select: chatFields });

/** Rule 2's chat, whether its number can send or not: the latest written to on a live number, else the main's; null. */
export async function customerChatOf(tx: OrgTx, phoneE164: string): Promise<SendingChat | null> {
  const written = await lastWrittenChat(tx, phoneE164);
  if (written !== null) return written;
  const main = await mainConnection(tx);
  return main === null ? null : chatOn(tx, main.id, phoneE164);
}

/**
 * The chat a send writes in, and its number. A chat's own number only (rule 1); for a customer, the chat they last wrote in
 * on a live number, else the main number's, made (with a missing person filled in) only when `make` is set (rule 2).
 */
export async function sendFrom(tx: OrgTx, target: SendTarget): Promise<SendFrom> {
  if ("chat" in target) {
    const chat = await tx.whatsappConversation.findUnique({ where: { id: target.chat }, select: chatFields });
    if (chat === null) return { ok: false, code: "none_yet" };
    const number = usable(await connectionById(tx, chat.connectionId));
    return number.ok ? { ok: true, chat, connection: number.connection } : number;
  }
  const { customer, make } = target;
  const written = await lastWrittenChat(tx, customer.phoneE164);
  const number = usable(written === null ? await mainConnection(tx) : await connectionById(tx, written.connectionId));
  if (!number.ok) return number;
  const { connection } = number;
  if (written === null && make) {
    await tx.whatsappConversation.createMany({
      data: [{ connectionId: connection.id, phoneE164: customer.phoneE164, personId: customer.personId }],
      skipDuplicates: true,
    });
  }
  const chat = written ?? (await chatOn(tx, connection.id, customer.phoneE164));
  if (chat === null) return { ok: false, code: "none_yet" };
  if (make && chat.personId === null && customer.personId !== null) {
    await tx.whatsappConversation.update({ where: { id: chat.id }, data: { personId: customer.personId } });
    return { ok: true, chat: { ...chat, personId: customer.personId }, connection };
  }
  return { ok: true, chat, connection };
}

/** The chosen template if it is on the number, else the approved one of the same name and language there; null. */
export async function templateOnNumber(tx: OrgTx, templateId: string, connectionId: string): Promise<string | null> {
  const chosen = await tx.whatsappTemplate.findUnique({
    where: { id: templateId },
    select: { connectionId: true, name: true, language: true },
  });
  if (chosen === null) return null;
  if (chosen.connectionId === connectionId) return templateId;
  const twin = await tx.whatsappTemplate.findFirst({
    where: { connectionId, name: chosen.name, language: chosen.language, status: "approved" },
    select: { id: true },
  });
  return twin?.id ?? null;
}
