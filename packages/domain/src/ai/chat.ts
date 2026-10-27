// The AI agent as staff see and steer it (the AI sales agent): a chat's AI state (answering or not, handed over and
// why, what it remembers, the lead's insight), turning the agent on or off in one chat, giving a handed-over chat back
// to it, a suggested reply for the person answering, and a test question against the agency's knowledge.
import { agentAnswer, type ChatAi, type LeadInsight } from "@travel-crm/contracts/ai";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { agentAnswers, agentPrompt, parseAnswer } from "./agent.js";
import { chatHistory, knowledgePack, leadFactsFor } from "./context.js";
import { aiSettingsOf } from "./settings.js";

export interface AiAssistDependencies {
  db: Database;
  ai: AiModel;
  agencyName: (organizationId: string) => Promise<string>;
}

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
const notConfigured = () =>
  new DomainError("FEATURE_LOCKED", "AI_NOT_CONFIGURED", "The AI assistant is not set up on this platform");
const unavailable = () => new DomainError("CONFLICT", "AI_UNAVAILABLE", "The AI did not answer; try again");

interface InsightRow {
  score: number;
  label: string;
  reasons: string[];
  fake: boolean;
  fakeReason: string | null;
  summary: string;
  nextStep: string;
  facts: unknown;
  updatedAt: Date;
}

const insightColumns = {
  score: true,
  label: true,
  reasons: true,
  fake: true,
  fakeReason: true,
  summary: true,
  nextStep: true,
  facts: true,
  updatedAt: true,
} as const;

function insightOf(row: InsightRow | null): LeadInsight | null {
  if (row === null) return null;
  const facts = agentAnswer.shape.facts.parse(row.facts);
  const label = row.label === "hot" || row.label === "cold" ? row.label : "warm";
  return { ...row, label, facts, updatedAt: row.updatedAt.toISOString() };
}

export async function leadInsightOf(tx: OrgTx, leadId: string): Promise<LeadInsight | null> {
  return insightOf(await tx.leadAiInsight.findFirst({ where: { leadId }, select: insightColumns }));
}

/** Every listed lead's score and label, for the inbox's and the leads' chips. */
export async function leadScoresOf(tx: OrgTx, leadIds: readonly string[]) {
  if (leadIds.length === 0) return [];
  return tx.leadAiInsight.findMany({
    where: { leadId: { in: [...leadIds] } },
    select: { leadId: true, score: true, label: true, fake: true },
  });
}

export async function chatAiOf(tx: OrgTx, conversationId: string, configured: boolean): Promise<ChatAi> {
  const chat = await tx.whatsappConversation.findUnique({ where: { id: conversationId }, select: { personId: true } });
  if (chat === null) throw notFound();
  const settings = await aiSettingsOf(tx);
  const state = await tx.aiChat.findFirst({ where: { conversationId } });
  const lead =
    chat.personId === null
      ? null
      : await tx.lead.findFirst({
          where: { personId: chat.personId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
  const mode = state?.mode === "on" || state?.mode === "off" ? state.mode : "default";
  return {
    mode,
    answering: configured && agentAnswers(mode, settings.autopilot) && state?.handedOffAt == null,
    handedOff: state?.handedOffAt != null,
    handoffReason: state?.handoffReason ?? null,
    memory: state?.memory ?? "",
    lastReplyAt: state?.lastReplyAt?.toISOString() ?? null,
    configured,
    insight: lead === null ? null : await leadInsightOf(tx, lead.id),
  };
}

async function chatState(tx: OrgTx, organizationId: string, conversationId: string) {
  const chat = await tx.whatsappConversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (chat === null) throw notFound();
  return tx.aiChat.upsert({
    where: { organizationId_conversationId: { organizationId, conversationId } },
    create: { conversationId },
    update: {},
    select: { id: true, mode: true },
  });
}

/** The agent on, off, or as the agency's autopilot says, in one chat. Turning it on gives a handed-over chat back. */
export async function setChatMode(
  tx: OrgTx,
  access: MemberAccess,
  input: { conversationId: string; mode: "default" | "on" | "off" },
): Promise<void> {
  const state = await chatState(tx, access.organizationId, input.conversationId);
  await tx.aiChat.update({
    where: { id: state.id },
    data: { mode: input.mode, ...(input.mode === "on" ? { handedOffAt: null, handoffReason: null } : {}) },
  });
  await recordAudit(tx, access, {
    action: "ai.chat-mode-changed",
    entityType: "whatsapp_conversation",
    entityId: input.conversationId,
    before: { mode: state.mode },
    after: { mode: input.mode },
  });
}

/** A handed-over chat goes back to the agent. */
export async function resumeChat(tx: OrgTx, access: MemberAccess, conversationId: string): Promise<void> {
  const state = await chatState(tx, access.organizationId, conversationId);
  await tx.aiChat.update({ where: { id: state.id }, data: { handedOffAt: null, handoffReason: null } });
  await recordAudit(tx, access, {
    action: "ai.chat-resumed",
    entityType: "whatsapp_conversation",
    entityId: conversationId,
  });
}

/** A reply the agent would write now, for the person answering to edit and send. Nothing is sent. */
export async function suggestReply(
  dependencies: AiAssistDependencies,
  access: MemberAccess,
  conversationId: string,
): Promise<{ text: string }> {
  const { db, ai } = dependencies;
  if (!ai.configured) throw notConfigured();
  const agency = await dependencies.agencyName(access.organizationId);
  const prepared = await db.forOrg(access.organizationId, async (tx) => {
    const chat = await tx.whatsappConversation.findUnique({
      where: { id: conversationId },
      select: { personId: true },
    });
    if (chat === null) throw notFound();
    const history = await chatHistory(tx, conversationId);
    const memory = (await tx.aiChat.findFirst({ where: { conversationId }, select: { memory: true } }))?.memory ?? "";
    return {
      settings: await aiSettingsOf(tx),
      history,
      memory,
      facts: await leadFactsFor(tx, chat.personId),
      knowledge: await knowledgePack(
        tx,
        history.messages
          .slice(-6)
          .map((message) => message.content)
          .join(" "),
      ),
    };
  });
  if (prepared.history.messages.length === 0) return { text: "" };
  const result = await ai.complete({
    tier: "chat",
    json: true,
    maxTokens: 700,
    user: access.organizationId,
    messages: [
      {
        role: "system",
        content: agentPrompt(
          prepared.settings,
          agency,
          "reply",
          prepared.knowledge,
          prepared.facts.words,
          prepared.memory,
        ),
      },
      ...prepared.history.messages,
    ],
  });
  if (!result.ok) throw unavailable();
  await db.forOrg(access.organizationId, (tx) =>
    tx.aiUsage.create({
      data: {
        kind: "suggest",
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    }),
  );
  return { text: parseAnswer(result.text)?.reply.trim() ?? "" };
}

/** What the agent would answer a customer's question, from the agency's knowledge alone: to check it before turning it on. */
export async function testAnswer(
  dependencies: AiAssistDependencies,
  access: MemberAccess,
  question: string,
): Promise<{ answer: string; handoff: boolean; reason: string }> {
  const { db, ai } = dependencies;
  if (!ai.configured) throw notConfigured();
  const agency = await dependencies.agencyName(access.organizationId);
  const { settings, knowledge } = await db.forOrg(access.organizationId, async (tx) => ({
    settings: await aiSettingsOf(tx),
    knowledge: await knowledgePack(tx, question),
  }));
  const result = await ai.complete({
    tier: "chat",
    json: true,
    maxTokens: 700,
    user: access.organizationId,
    messages: [
      {
        role: "system",
        content: agentPrompt(settings, agency, "reply", knowledge, "Nothing is known about this customer yet.", ""),
      },
      { role: "user", content: question },
    ],
  });
  if (!result.ok) throw unavailable();
  await db.forOrg(access.organizationId, (tx) =>
    tx.aiUsage.create({
      data: { kind: "test", model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    }),
  );
  const answer = parseAnswer(result.text);
  return { answer: answer?.reply.trim() ?? "", handoff: answer?.handoff ?? false, reason: answer?.handoffReason ?? "" };
}
