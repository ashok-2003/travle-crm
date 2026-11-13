// Plays one test chat through the real lite turn against a real database: each burst of customer lines is written as
// inbound messages, one turn answers it, and the turn's trace says what happened. Agency lines in the case are dropped
// (the lite agent's own replies take their place). The model is the caller's choice: scripted in CI, real in the script.
import { randomUUID } from "node:crypto";
import type { LiteCase } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { runAgentTurn, type AgentDependencies } from "../agent.js";
import { readLiteFacts } from "../lite/merge.js";
import type { LiteTrace } from "../lite/types.js";
import { BENCH_OWNER_ID } from "./seed.js";
import { benchChecks, heldItems, type BenchCheck, type BenchEnd, type BenchTurn } from "./rubric.js";

export interface LiteCaseResult extends BenchEnd {
  name: string;
  turns: BenchTurn[];
  checks: BenchCheck[];
}

type Line = LiteCase["chat"][number];

const destinationOf = { manali: "Manali", spiti: "Spiti", kashmir: "Kashmir" } as const;
const TEN_MINUTES = 10 * 60_000;
const FIVE_SECONDS = 5_000;
const FOUR_SECONDS = 4_000;

let nextPhone = Math.floor(Math.random() * 9e7);

/** Consecutive customer lines are one burst; an agency line ends it and is itself dropped. */
function burstsOf(chat: readonly Line[]): Line[][] {
  const bursts: Line[][] = [];
  let open = false;
  for (const line of chat) {
    if (line.from === "agency") {
      open = false;
      continue;
    }
    if (open) bursts.at(-1)?.push(line);
    else bursts.push([line]);
    open = true;
  }
  return bursts;
}

/** Sets which packages the AI may sell, and writes the customer, their new lead and an empty chat. */
async function setUpChat(tx: OrgTx, one: LiteCase): Promise<string> {
  const sellable = new Set<string>(one.agency.packages.map((key) => destinationOf[key]));
  for (const name of Object.values(destinationOf)) {
    await tx.quoteTemplate.updateMany({ where: { destination: { name } }, data: { aiSellable: sellable.has(name) } });
  }
  nextPhone += 1;
  const person = await tx.person.create({
    data: { name: "Test Customer", phoneE164: `+9197${String(nextPhone).padStart(8, "0")}` },
    select: { id: true, phoneE164: true },
  });
  await tx.lead.create({
    data: { personId: person.id, source: "phone_call", stage: "new", ownerUserId: BENCH_OWNER_ID },
  });
  const connection = await tx.whatsappConnection.findFirstOrThrow({ select: { id: true } });
  const chat = await tx.whatsappConversation.create({
    data: { connectionId: connection.id, phoneE164: person.phoneE164 ?? "", personId: person.id },
    select: { id: true },
  });
  return chat.id;
}

/** Writes a burst as inbound messages; returns the last one's id (the turn's token) and when the last arrived. */
async function writeBurst(tx: OrgTx, chatId: string, burst: readonly Line[], start: Date) {
  let lastId = "";
  let lastAt = start;
  for (const [index, line] of burst.entries()) {
    lastAt = new Date(start.getTime() + index * FIVE_SECONDS);
    const row = await tx.whatsappMessage.create({
      data: {
        conversationId: chatId,
        direction: "in",
        origin: "customer",
        kind: line.kind,
        ...(line.kind === "text" ? { body: line.text } : line.text === "" ? {} : { caption: line.text }),
        status: "received",
        occurredAt: lastAt,
        wamid: randomUUID(),
      },
      select: { id: true },
    });
    lastId = row.id;
  }
  await tx.whatsappConversation.update({ where: { id: chatId }, data: { lastInboundAt: lastAt, needsReply: true } });
  return { token: lastId, lastAt };
}

function turnOf(
  burst: readonly Line[],
  outcome: string,
  heldBefore: BenchTurn["heldBefore"],
  trace: LiteTrace | null,
): BenchTurn {
  const customer = burst.map((line) => line.text);
  if (trace === null) {
    return {
      customer,
      outcome,
      move: null,
      reason: null,
      why: null,
      intents: [],
      asked: null,
      heldBefore,
      text: null,
      filled: [],
      wrote: false,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      ms: 0,
    };
  }
  // The model's words are in the reply only when Write's last answer passed and the move stayed a talking one.
  const wrote = trace.checks.some((check) => check.name === "write" && check.passed) && trace.move !== "hand_over";
  return {
    customer,
    outcome,
    move: trace.move,
    reason: trace.reason,
    why: trace.why,
    intents: trace.intents,
    asked: trace.asked,
    heldBefore,
    text: trace.sent.text,
    filled: trace.sent.filled,
    wrote,
    model: trace.model,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    ms: trace.durationMs,
  };
}

async function endOf(tx: OrgTx, chatId: string): Promise<BenchEnd> {
  const messages = await tx.whatsappMessage.findMany({
    where: { conversationId: chatId, direction: "out", clientToken: { startsWith: "ai:" } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { body: true, caption: true, clientToken: true },
  });
  const state = await tx.aiChat.findFirst({ where: { conversationId: chatId } });
  const tokens = messages.map((message) => message.clientToken ?? "");
  return {
    sent: messages.map((message) => message.body ?? message.caption ?? ""),
    actions: {
      payment: tokens.some((token) => token.endsWith(":qr") || token.endsWith(":pay")),
      files: tokens.some((token) => /:f\d+$/.test(token)),
      booking: (await tx.aiBooking.count({ where: { conversationId: chatId } })) > 0,
      handOver: state?.handedOffAt != null,
    },
    flagged: state?.handedOffAt != null || state?.attentionAt != null,
    knows: state === null ? [] : heldItems(await readLiteFacts(tx, chatId)),
  };
}

/** Writes the case's chat into the organization, runs a turn per burst, and marks the chat against the case. */
export async function runLiteCase(
  dependencies: AgentDependencies,
  organizationId: string,
  one: LiteCase,
  now: Date,
): Promise<LiteCaseResult> {
  const { db } = dependencies;
  const chatId = await db.forOrg(organizationId, (tx) => setUpChat(tx, one));
  const traces: LiteTrace[] = [];
  const recording: AgentDependencies = {
    ...dependencies,
    traces: { record: (trace) => Promise.resolve(void traces.push(trace)) },
  };
  const turns: BenchTurn[] = [];
  for (const [index, burst] of burstsOf(one.chat).entries()) {
    const start = new Date(now.getTime() + index * TEN_MINUTES);
    const { token, lastAt } = await db.forOrg(organizationId, (tx) => writeBurst(tx, chatId, burst, start));
    const heldBefore = heldItems(await db.forOrg(organizationId, (tx) => readLiteFacts(tx, chatId)));
    traces.length = 0;
    const outcome = await runAgentTurn(
      recording,
      { organizationId, conversationId: chatId, kind: "reply", token },
      new Date(lastAt.getTime() + FOUR_SECONDS),
    );
    turns.push(turnOf(burst, outcome, heldBefore, traces.at(-1) ?? null));
  }
  const end = await db.forOrg(organizationId, (tx) => endOf(tx, chatId));
  return { name: one.name, ...end, turns, checks: benchChecks(one, turns, end) };
}
