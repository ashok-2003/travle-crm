// The AI, step 1 (ADR 0029; the owner's decisions of 2026-10-28): an agency's own switch and instructions, what it tells its
// AI to know (typed words or a PDF's), Suggest reply (a draft in a chat for a member to read, change and send: it never sends
// by itself) and the AI's guess of how a lead will go.
import { z } from "zod";
import { aiKnowledgeFileTypes, presignedUpload } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";
import { tripAnswer } from "./fill-answer.js";

export const AI_INSTRUCTIONS_MAX = 4000;

/** What an Owner or Admin sets. Off until they turn it on. */
export const saveAiSettingsInput = z.strictObject({
  enabled: z.boolean(),
  /** The AI scores each lead from its chat: its chance to book, why and the next step. */
  scoring: z.boolean(),
  /** New WhatsApp leads are filled in from their first messages, as suggestions (release ai2a); left as it was when omitted. */
  fillLeads: z.boolean().optional(),
  /** What the agency tells its AI: its tone and language, what to offer, what never to say. */
  instructions: z.string().trim().max(AI_INSTRUCTIONS_MAX),
});
export type SaveAiSettingsInput = z.infer<typeof saveAiSettingsInput>;

export const aiSettings = z.object({
  enabled: z.boolean(),
  scoring: z.boolean(),
  fillLeads: z.boolean(),
  instructions: z.string(),
  /** False when this server has no AI key: the switch can be on but no suggestion is made, and the screen says so. */
  providerReady: z.boolean(),
  /** AI calls an agency may make a month (every AI feature shares them), and how many it has made this month. */
  monthlyLimit: z.int(),
  usedThisMonth: z.int(),
});
export type AiSettings = z.infer<typeof aiSettings>;

/** What the composer needs to know: whether to offer Suggest reply at all. */
export const aiStatus = z.object({ enabled: z.boolean() });

export const suggestReplyInput = z.strictObject({ conversationId: recordId });
export type SuggestReplyInput = z.infer<typeof suggestReplyInput>;

export const suggestedReply = z.object({
  /** Quoted back when the reply is sent, so the send is audited as drafted by AI. */
  draftId: recordId,
  text: z.string(),
  usedThisMonth: z.int(),
  monthlyLimit: z.int(),
});
export type SuggestedReply = z.infer<typeof suggestedReply>;

/** The largest document the agency gives its AI. */
export const MAX_AI_KNOWLEDGE_BYTES = 10 * 1024 * 1024;
export const aiKnowledgeContentTypes = aiKnowledgeFileTypes;

export const aiKnowledgeItem = z.object({
  id: recordId,
  title: z.string(),
  body: z.string(),
  kind: z.enum(["text", "file"]),
  fileName: z.string().nullable(),
  /** reading: a file's words are being read; failed: it had none to read. */
  status: z.enum(["ready", "reading", "failed"]),
  /** Off: the AI doesn't use it. */
  enabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type AiKnowledgeItem = z.infer<typeof aiKnowledgeItem>;
export const aiKnowledgeList = z.array(aiKnowledgeItem);

export const addAiKnowledgeInput = z.strictObject({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(60_000),
});
export const updateAiKnowledgeInput = z.strictObject({
  knowledgeId: recordId,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(60_000),
  enabled: z.boolean(),
});
export type UpdateAiKnowledgeInput = z.infer<typeof updateAiKnowledgeInput>;
export const aiKnowledgeIdInput = z.strictObject({ knowledgeId: recordId });
export const requestAiDocumentInput = z.strictObject({
  title: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(aiKnowledgeContentTypes),
  sizeBytes: z.int().min(1).max(MAX_AI_KNOWLEDGE_BYTES),
});
export type RequestAiDocumentInput = z.infer<typeof requestAiDocumentInput>;
export const confirmAiDocumentInput = z.strictObject({ knowledgeId: recordId, attachmentId: recordId });
/** Step one of a document: where the browser puts the file. */
export const aiDocumentSlot = z.object({ knowledgeId: recordId, attachmentId: recordId, upload: presignedUpload });

export const insightLabels = ["hot", "warm", "cold"] as const;
/** What the customer said they want, as words. */
export const insightFacts = z.object({
  destination: z.string().nullable(),
  when: z.string().nullable(),
  travellers: z.string().nullable(),
  budget: z.string().nullable(),
});
/** The AI's guess of how a lead will go: shown as a guess, never a fact, and it never moves the lead's stage. */
export const leadInsight = z.object({
  score: z.int().min(0).max(100),
  label: z.enum(insightLabels),
  reasons: z.array(z.string()),
  fake: z.boolean(),
  fakeReason: z.string().nullable(),
  /** A line or two on how the lead stands, written with the score. */
  summary: z.string(),
  nextStep: z.string(),
  facts: insightFacts,
  updatedAt: z.iso.datetime(),
});
export type LeadInsight = z.infer<typeof leadInsight>;
export const leadInsightInput = z.strictObject({ leadId: recordId });
export const leadInsightAnswer = z.object({ insight: leadInsight.nullable() });

/** What the model answers when it scores a lead: checked here, whatever the provider promised. */
export const scoreAnswer = z.object({
  score: z.number().transform((value) => Math.max(0, Math.min(100, Math.round(value)))),
  label: z.enum(insightLabels).catch("warm"),
  reasons: z.array(z.string().trim().max(200)).max(4).catch([]),
  fake: z.boolean().catch(false),
  fakeReason: z.string().trim().max(200).catch(""),
  summary: z.string().trim().max(400).catch(""),
  nextStep: z.string().trim().max(300).catch(""),
  facts: insightFacts.partial().catch({}),
  /** The customer's trip as they said it, asked for while a new lead's fields are still being filled (fill-answer.ts). */
  trip: tripAnswer.nullish().catch(undefined),
});
export type ScoreAnswer = z.infer<typeof scoreAnswer>;

/** The queue job of one lead's scoring: ids only. */
export const aiScoreJob = z.object({ organizationId: recordId, conversationId: recordId, messageId: recordId });
export const aiDocumentAddedEvent = z.strictObject({ knowledgeId: recordId });
