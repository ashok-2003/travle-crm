// Plays one test chat through the whole agent turn against a real database and says what happened and whether the case's
// expectations hold. The memory model is scripted from the case (CI, and `--fake`); the real model is the caller's choice.
import { randomUUID } from "node:crypto";
import type { AgentCase } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { AI_HANDOFF_KIND, runAgentTurn, type AgentDependencies } from "../agent.js";
import { CASE_OWNER_ID } from "./evaluate-seed.js";

export { CASE_NOW, seedCaseAgency } from "./evaluate-seed.js";

export interface CaseCheck {
  /** "sent", "includes 1", "blockedReason"...: never the words themselves. */
  name: string;
  pass: boolean;
}

export interface CaseResult {
  name: string;
  /** What the turn answered the first time it ran (the retry's answer is `retried`). */
  outcome: string;
  retried: string | null;
  /** The text of every message of the AI in the chat, in order: the reply, a file's caption, the payment details. */
  sent: string[];
  actions: { payment: boolean; files: boolean; booking: boolean; handOver: boolean };
  flagged: boolean;
  reason: string | null;
  notices: number;
  records: { bookings: number; holds: number; quotes: number };
  checks: CaseCheck[];
}

const destinationOf = { manali: "Manali", spiti: "Spiti", kashmir: "Kashmir" } as const;
const noActions = {
  sendFiles: [],
  sendAgencyFiles: false,
  sendPayment: false,
  requestBooking: false,
  flag: null,
  handOver: null,
  note: null,
  task: null,
};
const nothingRead = {
  places: [],
  startsOn: null,
  rooms: [],
  travellers: null,
  budgetRupees: null,
  pickupCity: null,
  chosen: null,
  wants: "information",
  wantsEvidence: "",
  special: null,
  nearest: [],
};

/** The memory model answering what the case scripted: the read first, then each write in order. */
export function scriptedModel(one: AgentCase): MemoryAiModel {
  const model = createMemoryAiModel();
  const script = one.scripted;
  if (script === undefined) return model;
  const read = script.read;
  const writes = script.write.map((write) =>
    typeof write === "string"
      ? write
      : JSON.stringify({ reply: write.reply, actions: { ...noActions, ...write.actions } }),
  );
  model.answer(
    ...(read === undefined ? [] : [typeof read === "string" ? read : JSON.stringify({ ...nothingRead, ...read })]),
    ...writes,
  );
  return model;
}

let nextPhone = Math.floor(Math.random() * 9e7);

/** Sets the agency as the case says and writes the chat; returns the chat and the message the turn answers. */
async function setUpChat(tx: OrgTx, one: AgentCase, now: Date) {
  const sellable = new Set<string>(one.agency.packages.map((key) => destinationOf[key]));
  for (const name of Object.values(destinationOf)) {
    await tx.quoteTemplate.updateMany({ where: { destination: { name } }, data: { aiSellable: sellable.has(name) } });
  }
  await tx.aiSettings.updateMany({ data: { customTrips: one.agency.customTrips } });
  nextPhone += 1;
  const person = await tx.person.create({
    data: { name: "Test Customer", phoneE164: `+9197${String(nextPhone).padStart(8, "0")}` },
    select: { id: true, phoneE164: true },
  });
  await tx.lead.create({
    data: { personId: person.id, source: "phone_call", stage: "contacted", ownerUserId: CASE_OWNER_ID },
  });
  const connection = await tx.whatsappConnection.findFirstOrThrow({ select: { id: true } });
  const at = (index: number) => new Date(now.getTime() - 60_000 - (one.chat.length - 1 - index) * 20 * 60_000);
  const lastCustomer = one.chat.findLastIndex((line) => line.from === "customer");
  const chat = await tx.whatsappConversation.create({
    data: {
      connectionId: connection.id,
      phoneE164: person.phoneE164 ?? "",
      personId: person.id,
      lastInboundAt: at(lastCustomer),
      needsReply: true,
    },
    select: { id: true },
  });
  let messageId = "";
  for (const [index, line] of one.chat.entries()) {
    const inbound = line.from === "customer";
    const row = await tx.whatsappMessage.create({
      data: {
        conversationId: chat.id,
        direction: inbound ? "in" : "out",
        origin: inbound ? "customer" : "automation",
        kind: line.kind,
        ...(line.kind === "text" ? { body: line.text } : line.text === "" ? {} : { caption: line.text }),
        status: inbound ? "received" : "sent",
        occurredAt: at(index),
        ...(inbound ? { wamid: randomUUID() } : {}),
      },
      select: { id: true },
    });
    if (index === lastCustomer) messageId = row.id;
  }
  return { chatId: chat.id, messageId };
}

async function observe(tx: OrgTx, chatId: string) {
  const messages = await tx.whatsappMessage.findMany({
    where: { conversationId: chatId, direction: "out", clientToken: { startsWith: "ai:" } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { body: true, caption: true, fileName: true },
  });
  const state = await tx.aiChat.findFirst({ where: { conversationId: chatId } });
  const chat = await tx.whatsappConversation.findUniqueOrThrow({ where: { id: chatId }, select: { personId: true } });
  const lead = { lead: { personId: chat.personId ?? "" } };
  return {
    sent: messages.map((message) => message.body ?? message.caption ?? ""),
    payment: messages.some((message) => message.fileName === "qr.png" || /pay to upi/i.test(message.body ?? "")),
    files: messages.some((message) => message.fileName !== null && message.fileName !== "qr.png"),
    booking: (await tx.aiBooking.count({ where: { conversationId: chatId } })) > 0,
    handOver: state?.handedOffAt != null,
    reason: state?.attentionReason ?? null,
    notices: await tx.notification.count({ where: { kind: AI_HANDOFF_KIND, link: `/inbox/${chatId}` } }),
    records: {
      bookings: await tx.aiBooking.count({ where: { conversationId: chatId } }),
      holds: await tx.departureHold.count({ where: lead }),
      quotes: await tx.quote.count({ where: lead }),
    },
    messages: messages.length,
  };
}

/** What the case expects, one check each; the names never hold the words they look for. */
function checksOf(one: AgentCase, seen: Awaited<ReturnType<typeof observe>>): CaseCheck[] {
  const expect = one.expect;
  const text = seen.sent.join("\n").toLowerCase();
  const checks: CaseCheck[] = [{ name: "sent", pass: seen.messages > 0 === expect.sent }];
  expect.includes?.forEach((word, index) =>
    checks.push({ name: `includes ${String(index + 1)}`, pass: text.includes(word.toLowerCase()) }),
  );
  expect.excludes?.forEach((word, index) =>
    checks.push({ name: `excludes ${String(index + 1)}`, pass: !text.includes(word.toLowerCase()) }),
  );
  for (const [key, want] of Object.entries(expect.actions ?? {})) {
    const got = seen[key === "handOver" ? "handOver" : (key as "payment" | "files" | "booking")];
    checks.push({ name: `actions ${key}`, pass: got === want });
  }
  const flagged = seen.reason !== null || seen.handOver;
  if (expect.flagged !== undefined) checks.push({ name: "flagged", pass: flagged === expect.flagged });
  if (expect.notices !== undefined) checks.push({ name: "notices", pass: seen.notices === expect.notices });
  if (expect.blockedReason !== undefined) {
    checks.push({ name: "blockedReason", pass: seen.reason?.includes(expect.blockedReason) === true });
  }
  if (expect.messages !== undefined) checks.push({ name: "messages", pass: seen.messages === expect.messages });
  for (const [key, want] of Object.entries(expect.records ?? {})) {
    checks.push({ name: `records ${key}`, pass: seen.records[key as keyof typeof seen.records] === want });
  }
  return checks;
}

/** Writes the case's chat into the organization, runs the turn (twice with the same token when `retry` says), and reports. */
export async function runAgentCase(
  dependencies: AgentDependencies,
  organizationId: string,
  one: AgentCase,
  now: Date,
): Promise<CaseResult> {
  const { chatId, messageId } = await dependencies.db.forOrg(organizationId, (tx) => setUpChat(tx, one, now));
  const turn = () =>
    runAgentTurn(dependencies, { organizationId, conversationId: chatId, kind: "reply", token: messageId }, now);
  const outcome = await turn();
  const retried = one.retry ? await turn() : null;
  const seen = await dependencies.db.forOrg(organizationId, (tx) => observe(tx, chatId));
  return {
    name: one.name,
    outcome,
    retried,
    sent: seen.sent,
    actions: { payment: seen.payment, files: seen.files, booking: seen.booking, handOver: seen.handOver },
    flagged: seen.reason !== null || seen.handOver,
    reason: seen.reason,
    notices: seen.notices,
    records: seen.records,
    checks: checksOf(one, seen),
  };
}
