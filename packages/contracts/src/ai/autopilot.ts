// The AI's autopilot (AI step 2; the owner's decisions of 2026-10-28): the AI answers WhatsApp chats by itself, nudges quiet
// customers once, writes the way one chosen staff member writes and learns what works from the agency's chats. Off until an
// Owner or Admin turns it on; every message it sends is marked as the AI's in the chat and audited. This file holds the
// settings, a chat's state, the agent's own answer (which code validates before anything is sent), the lessons it learns
// and the style it copies. Only the staff member's own messages are ever read for a style: the customer's side of a chat
// export stays in the browser.
import { z } from "zod";
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
/** What the AI is for: a sales agent, or an everyday conversation in the copied person's way of talking. */
export const aiPersonas = ["sales", "natural"] as const;

export const autopilotFields = {
  autopilot: z.boolean(),
  agentName: text(80),
  followUpHours: z.int().min(0).max(20),
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
export const saveAutopilotInput = z.strictObject(autopilotFields);
export type SaveAutopilotInput = z.infer<typeof saveAutopilotInput>;

/** A way of talking it copies: whose, the style guide written of it, and how many of their messages it keeps. */
export const aiVoice = z.object({ name: z.string(), profile: z.string(), examples: z.int() });
export type AiVoice = z.infer<typeof aiVoice>;

export const autopilotSettings = z.object({
  ...autopilotFields,
  agentName: z.string(),
  languageOther: z.string(),
  /** When it last learned from the chats. */
  learnedAt: z.iso.datetime().nullable(),
  /** The person whose way of talking it copies in every chat, if one was given. */
  voice: aiVoice.nullable(),
});
export type AutopilotSettings = z.infer<typeof autopilotSettings>;

export const aiChatModes = ["default", "on", "off"] as const;
export const aiChatMode = z.enum(aiChatModes);
export const conversationAiInput = z.strictObject({ conversationId: recordId });
export const setChatAiInput = z.strictObject({ conversationId: recordId, mode: aiChatMode });
export const setChatPersonaInput = z.strictObject({
  conversationId: recordId,
  persona: z.enum(["default", ...aiPersonas]),
});

/** A chat as the inbox shows the AI in it. */
export const chatAi = z.object({
  mode: aiChatMode,
  /** Whether the AI answers in this chat now: the mode, else the agency's autopilot. */
  answering: z.boolean(),
  handedOff: z.boolean(),
  handoffReason: z.string().nullable(),
  memory: z.string(),
  lastReplyAt: z.iso.datetime().nullable(),
  /** What it is doing now: waiting a moment for the customer's next line, or writing its answer. */
  turn: z.enum(["queued", "thinking"]).nullable(),
  followUpAt: z.iso.datetime().nullable(),
  followUpReason: z.string().nullable(),
  /** What it flagged for the team while it kept answering ("wants to book"), recently. */
  attention: z.string().nullable(),
  /** Until when it waits because someone on the team wrote in the chat; null when it isn't waiting. */
  personPausedUntil: z.iso.datetime().nullable(),
  voice: aiVoice.nullable(),
  persona: z.enum(["default", ...aiPersonas]),
  /** The name it writes as ("Riya"), else empty. */
  agentName: z.string(),
  /** Whether this server has an AI key, and the agency may use the AI at all (plan, subscription, its own switch). */
  available: z.boolean(),
});
export type ChatAi = z.infer<typeof chatAi>;

/** ai.chat-resumed: someone gave a chat back to the AI; it answers the customer's last message now. */
export const aiChatResumedEvent = z.strictObject({ conversationId: recordId });
/** The ai.reply job: the AI's turn after a customer's message, a few seconds later so a burst reads as one. */
export const aiReplyJob = z.strictObject({ organizationId: recordId, conversationId: recordId, messageId: recordId });

/**
 * The agent's answer, as the model must give it (JSON). `reply` is what goes to the customer (empty for none);
 * `handoff` hands the chat to a person, with why; `memory` replaces what it remembers of the chat.
 */
export const agentAnswer = z.object({
  reply: z.string().max(1500).catch(""),
  handoff: z.boolean().catch(false),
  handoffReason: z.string().max(300).catch(""),
  /** Something the team should see while it keeps answering ("wants to book for 4 on 12 Dec"); empty for none. */
  attention: z.string().max(200).catch(""),
  memory: z.string().max(2000).catch(""),
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
 * Learn one staff member's way of talking from THEIR OWN WhatsApp messages (read from a chat export in the browser, which
 * drops everything the other side wrote before sending): for the whole agency.
 */
export const learnVoiceInput = z.strictObject({
  personName: text(80).min(1),
  ownMessages: z
    .array(z.string().trim().min(1).max(1000))
    .min(5, "At least 5 of their messages")
    .max(1500)
    .refine((all) => all.reduce((sum, one) => sum + one.length, 0) <= MAX_VOICE_SAMPLE_CHARACTERS),
});
export type LearnVoiceInput = z.infer<typeof learnVoiceInput>;
/** What the style-reader must answer (JSON). */
export const voiceAnswer = z.object({
  profile: z.string().min(1).max(4000),
  examples: z.array(z.string().max(500)).max(40).catch([]),
});

/** The AI's last day at a glance, for the AI screen's head. */
export const aiOverview = z.object({
  chatsAnswered: z.int(),
  messagesSent: z.int(),
  /** Middle time from a customer's message to the AI's answer, in seconds; null with none. */
  medianReplySeconds: z.int().nullable(),
  flagged: z.int(),
  followUpsPlanned: z.int(),
  learnings: z.int(),
});
export type AiOverview = z.infer<typeof aiOverview>;
