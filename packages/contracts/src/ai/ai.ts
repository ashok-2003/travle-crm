// The AI sales agent (sales execution, ADR 0029 as the owner widened it on 2026-10-27): the agency's AI settings, what
// the agent knows, each chat's AI state, each lead's insight (likelihood to book, why, fake or not, the next step),
// reply suggestions for staff, and the agent's own answer, which code validates before anything is sent.
import { z } from "zod";
import { presignedUpload } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";

const text = (max: number) => z.string().trim().max(max);

/** The language it writes in: the customer's own, or one the agency chooses. */
export const aiLanguages = ["customer", "english", "hindi", "hinglish", "other"] as const;
/** How it lays a message out: natural lines as a person writes, one or two short lines, or points. */
export const aiStyles = ["human", "short", "points"] as const;
export const aiEmojiLevels = ["none", "few", "many"] as const;
export const aiTones = ["friendly", "professional", "enthusiastic"] as const;
/**
 * When it steps back: `alert` never by itself (it flags the team and keeps selling until someone takes over), `asked`
 * when the customer asks for a person or is upset, `careful` also for bookings, payments and discounts.
 */
export const aiHandoffPolicies = ["alert", "asked", "careful"] as const;
/** What the AI is for: a sales agent, or an everyday conversation as the person whose way of talking it copies. */
export const aiPersonas = ["sales", "natural"] as const;

export const aiSettingsFields = {
  autopilot: z.boolean(),
  scoring: z.boolean(),
  agentName: text(80),
  instructions: text(4000),
  followUpHours: z.int().min(0).max(23),
  maxRepliesPerDay: z.int().min(1).max(200),
  language: z.enum(aiLanguages),
  languageOther: text(40),
  style: z.enum(aiStyles),
  emojis: z.enum(aiEmojiLevels),
  tone: z.enum(aiTones),
  handoff: z.enum(aiHandoffPolicies),
  smartFollowUp: z.boolean(),
  learning: z.boolean(),
  persona: z.enum(aiPersonas),
};
export const saveAiSettingsInput = z.strictObject(aiSettingsFields);
export type SaveAiSettingsInput = z.infer<typeof saveAiSettingsInput>;
export const aiSettings = z.object({
  ...aiSettingsFields,
  agentName: z.string(),
  instructions: z.string(),
  languageOther: z.string(),
  /** When it last learned from the chats. */
  learnedAt: z.iso.datetime().nullable(),
  /** The person whose way of talking it copies in every chat, if one was given. */
  voice: z.object({ name: z.string(), profile: z.string(), examples: z.int() }).nullable(),
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
export const setChatPersonaInput = z.strictObject({
  conversationId: recordId,
  persona: z.enum(["default", "sales", "natural"]),
});

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
  /** The follow-up it planned for this quiet customer, and why. */
  followUpAt: z.iso.datetime().nullable(),
  followUpReason: z.string().nullable(),
  /** What it flagged for the team while it kept answering ("wants to book"), recently. */
  attention: z.string().nullable(),
  /** The way of talking it copies in this chat: this chat's own, else the agency's. */
  voice: z
    .object({
      name: z.string(),
      profile: z.string(),
      examples: z.int(),
      own: z.boolean(),
      /** What this chat's imported export says the two talked about before. */
      context: z.string().nullable(),
    })
    .nullable(),
  /** What the AI is for in this chat (default: the agency's), and what that comes to. */
  persona: z.enum(["default", ...aiPersonas]),
  natural: z.boolean(),
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
  /** Something the team should see while the agent keeps answering ("wants to book for 4 on 12 Dec"); empty for none. */
  attention: z.string().max(200).catch(""),
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
  /** Whether to write again if the customer goes quiet, in how many hours, and why. */
  followUp: z
    .object({
      needed: z.boolean().catch(false),
      inHours: z.coerce.number().min(0).max(23).catch(4),
      why: z.string().max(200).catch(""),
    })
    .catch({ needed: false, inHours: 4, why: "" }),
});
export type AgentAnswer = z.infer<typeof agentAnswer>;

export const aiLearningKinds = ["need", "winning", "objection", "style", "faq"] as const;
export const aiLearning = z.object({
  id: recordId,
  kind: z.enum(aiLearningKinds),
  text: z.string(),
  evidence: z.int(),
  state: z.enum(["active", "off"]),
  updatedAt: z.iso.datetime(),
});
export type AiLearning = z.infer<typeof aiLearning>;
export const aiLearningList = z.array(aiLearning);
export const setAiLearningInput = z.strictObject({
  learningId: recordId,
  state: z.enum(["active", "off", "dismissed"]),
});
export const aiLearnResult = z.object({ added: z.int(), updated: z.int() });

/** What the lesson-maker must answer (JSON): lessons, each new or refining one it was shown by its id. */
export const learnAnswer = z.object({
  learnings: z
    .array(
      z.object({
        id: z.string().nullable().catch(null),
        kind: z.enum(aiLearningKinds).catch("need"),
        text: z.string().min(1).max(400),
        evidence: z.coerce.number().int().min(1).max(1000).catch(1),
      }),
    )
    .max(25)
    .catch([]),
});

/** Characters of one person's messages sent to learn their way of talking, at most. */
export const MAX_VOICE_SAMPLE_CHARACTERS = 40_000;
/**
 * Learn one person's way of talking from their own WhatsApp messages (read from a chat export in the browser): for the
 * whole agency, or for one chat when it names one.
 */
export const learnVoiceInput = z.strictObject({
  conversationId: recordId.optional(),
  personName: text(80).min(1),
  /** The chat in order, both sides: `own` marks the chosen person's messages. */
  messages: z
    .array(z.strictObject({ own: z.boolean(), text: z.string().trim().min(1).max(1000) }))
    .max(1500)
    .refine((all) => all.filter((one) => one.own).length >= 5, { message: "At least 5 of their messages" })
    .refine((all) => all.reduce((sum, one) => sum + one.text.length, 0) <= MAX_VOICE_SAMPLE_CHARACTERS),
});
export type LearnVoiceInput = z.infer<typeof learnVoiceInput>;
export const clearVoiceInput = z.strictObject({ conversationId: recordId.optional() });
/** A way of talking the agent copies: whose, the style guide written of it, and how many of their messages it keeps. */
export const aiVoice = z.object({ name: z.string(), profile: z.string(), examples: z.int() });
export type AiVoice = z.infer<typeof aiVoice>;
/** What the style-reader must answer (JSON). */
export const voiceAnswer = z.object({
  profile: z.string().min(1).max(4000),
  examples: z.array(z.string().max(500)).max(40).catch([]),
  /** What the two talked about: topics, plans, likes, how they are with each other. */
  context: z.string().max(4000).catch(""),
});

/** The AI's last day at a glance, for the AI screen's head. */
export const aiOverview = z.object({
  chatsAnswered: z.int(),
  messagesSent: z.int(),
  /** Middle time from a customer's message to the AI's answer, in seconds; null with none. */
  medianReplySeconds: z.int().nullable(),
  hotLeads: z.int(),
  fakeLeads: z.int(),
  flagged: z.int(),
  followUpsPlanned: z.int(),
  learnings: z.int(),
});
export type AiOverview = z.infer<typeof aiOverview>;
