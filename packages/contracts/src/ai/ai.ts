// The AI sales agent (sales execution, ADR 0029 as the owner widened it on 2026-10-27): the agency's AI settings, what
// the agent knows, each chat's AI state, each lead's insight (likelihood to book, why, fake or not, the next step),
// reply suggestions for staff, and the agent's own answer, which code validates before anything is sent.
import { z } from "zod";
import { presignedUpload } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";

const text = (max: number) => z.string().trim().max(max);

export const aiSettingsFields = {
  autopilot: z.boolean(),
  scoring: z.boolean(),
  agentName: text(80),
  instructions: text(4000),
  followUpHours: z.int().min(0).max(23),
  maxRepliesPerDay: z.int().min(1).max(200),
};
export const saveAiSettingsInput = z.strictObject(aiSettingsFields);
export type SaveAiSettingsInput = z.infer<typeof saveAiSettingsInput>;
export const aiSettings = z.object({
  ...aiSettingsFields,
  agentName: z.string(),
  instructions: z.string(),
  /** Whether the platform set an AI key and models: off, nothing here runs. */
  configured: z.boolean(),
  models: z.object({ chat: z.array(z.string()), fast: z.array(z.string()) }),
});
export type AiSettings = z.infer<typeof aiSettings>;

/** The kinds of document the agent reads. */
export const aiKnowledgeContentTypes = ["application/pdf", "text/plain"] as const;
export const MAX_AI_KNOWLEDGE_BYTES = 10 * 1024 * 1024;

export const aiKnowledgeItem = z.object({
  id: recordId,
  title: z.string(),
  body: z.string(),
  kind: z.enum(["text", "file"]),
  fileName: z.string().nullable(),
  status: z.enum(["ready", "reading", "failed"]),
  enabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type AiKnowledgeItem = z.infer<typeof aiKnowledgeItem>;
export const aiKnowledgeList = z.array(aiKnowledgeItem);
export const createAiKnowledgeInput = z.strictObject({ title: text(120).min(1), body: text(60_000).min(1) });
export const updateAiKnowledgeInput = z.strictObject({
  knowledgeId: recordId,
  title: text(120).min(1),
  body: text(60_000),
  enabled: z.boolean(),
});
export type UpdateAiKnowledgeInput = z.infer<typeof updateAiKnowledgeInput>;
export const aiKnowledgeIdInput = z.strictObject({ knowledgeId: recordId });
export const requestAiDocumentInput = z.strictObject({
  title: text(120).min(1),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(aiKnowledgeContentTypes),
  sizeBytes: z.int().min(1).max(MAX_AI_KNOWLEDGE_BYTES),
});
export type RequestAiDocumentInput = z.infer<typeof requestAiDocumentInput>;
export const aiDocumentSlot = z.object({
  knowledgeId: recordId,
  attachmentId: recordId,
  upload: presignedUpload,
});
export const confirmAiDocumentInput = z.strictObject({ knowledgeId: recordId, attachmentId: recordId });

export const aiChatModes = ["default", "on", "off"] as const;
export const aiChatMode = z.enum(aiChatModes);
export const conversationAiInput = z.strictObject({ conversationId: recordId });
export const setChatAiInput = z.strictObject({ conversationId: recordId, mode: aiChatMode });
export const resumeChatAiInput = z.strictObject({ conversationId: recordId });

export const insightLabel = z.enum(["hot", "warm", "cold"]);
export const leadInsight = z.object({
  score: z.int().min(0).max(100),
  label: insightLabel,
  reasons: z.array(z.string()),
  fake: z.boolean(),
  fakeReason: z.string().nullable(),
  summary: z.string(),
  nextStep: z.string(),
  facts: z.object({
    destination: z.string().nullable(),
    when: z.string().nullable(),
    travellers: z.string().nullable(),
    budget: z.string().nullable(),
  }),
  updatedAt: z.iso.datetime(),
});
export type LeadInsight = z.infer<typeof leadInsight>;

export const chatAi = z.object({
  mode: aiChatMode,
  /** Whether the agent answers in this chat now: the mode, else the agency's autopilot. */
  answering: z.boolean(),
  handedOff: z.boolean(),
  handoffReason: z.string().nullable(),
  memory: z.string(),
  lastReplyAt: z.iso.datetime().nullable(),
  /** What the agent is doing now: waiting a moment for the customer's next line, or writing its answer. */
  turn: z.enum(["queued", "thinking"]).nullable(),
  /** The name it writes as ("Riya"), else empty. */
  agentName: z.string(),
  configured: z.boolean(),
  insight: leadInsight.nullable(),
});
export type ChatAi = z.infer<typeof chatAi>;

export const leadInsightInput = z.strictObject({ leadId: recordId });
export const suggestedReply = z.object({ text: z.string() });
export const testAiInput = z.strictObject({ question: text(1000).min(1) });
export const testAiAnswer = z.object({ answer: z.string(), handoff: z.boolean(), reason: z.string() });

/** ai.document-added: a document's file is stored; the worker reads its words. */
export const aiDocumentAddedEvent = z.strictObject({ knowledgeId: recordId });
/** The ai.reply job: the agent's turn after a customer's message, a few seconds later so a burst reads as one. */
export const aiReplyJob = z.strictObject({ organizationId: recordId, conversationId: recordId, messageId: recordId });

/**
 * The agent's answer, as the model must give it (JSON). `reply` is what goes to the customer (empty for none);
 * `handoff` hands the chat to a person, with why; `memory` replaces what it remembers of the chat; the rest is the
 * lead's insight.
 */
export const agentAnswer = z.object({
  reply: z.string().max(1500).catch(""),
  handoff: z.boolean().catch(false),
  handoffReason: z.string().max(300).catch(""),
  memory: z.string().max(2500).catch(""),
  score: z.coerce.number().int().min(0).max(100).catch(30),
  label: insightLabel.catch("warm"),
  reasons: z.array(z.string().max(200)).max(6).catch([]),
  fake: z.boolean().catch(false),
  fakeReason: z.string().max(300).catch(""),
  nextStep: z.string().max(300).catch(""),
  facts: z
    .object({
      destination: z.string().max(120).nullable().catch(null),
      when: z.string().max(120).nullable().catch(null),
      travellers: z.string().max(120).nullable().catch(null),
      budget: z.string().max(120).nullable().catch(null),
    })
    .catch({ destination: null, when: null, travellers: null, budget: null }),
});
export type AgentAnswer = z.infer<typeof agentAnswer>;
