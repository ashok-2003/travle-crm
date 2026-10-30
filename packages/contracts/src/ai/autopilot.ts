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
  /** It writes a short note on the lead when a chat tells it something worth keeping. */
  leadNotes: z.boolean(),
  /** It sends the agency's media (photos, videos, PDFs) when they help. */
  sendMedia: z.boolean(),
  /** How customers pay (UPI ID, bank account, a link): sent exactly as written when someone wants to book. */
  paymentDetails: text(2000),
  /** Rules it always follows, whatever else it is told. */
  strictRules: text(4000),
  /** It adds follow-ups to leads from its chats, and writes to each lead whose follow-up comes due, inside the window. */
  followUpTasks: z.boolean(),
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
  paymentDetails: z.string(),
  strictRules: z.string(),
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
  /** The way of talking it copies here: this chat's own (with what the two talked about), else the agency's. */
  voice: aiVoice.extend({ own: z.boolean(), context: z.string().nullable(), history: z.int() }).nullable(),
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
  /** A short note for the lead's record when this message told something worth keeping; empty for none. */
  note: z.string().max(600).catch(""),
  /** A follow-up for the team on the lead: the customer asked to be contacted later, or a call is due. */
  task: z
    .object({
      needed: z.boolean().catch(false),
      title: z.string().max(200).catch(""),
      inHours: z.coerce.number().min(1).max(336).catch(24),
    })
    .catch({ needed: false, title: "", inHours: 24 }),
  /** The agency's media to send with the reply, by their numbers in the prompt ("M1"). */
  media: z.array(z.string().max(20)).max(10).catch([]),
  /** Send the agency's payment details now, as their own message (the customer wants to book or asks how to pay). */
  sendPaymentDetails: z.boolean().catch(false),
  /** The customer clearly said yes to a trip: the booking's details as taken down. */
  booking: z
    .object({
      confirmed: z.boolean().catch(false),
      summary: z.string().max(300).catch(""),
      package: z.string().max(200).catch(""),
      dates: z.string().max(120).catch(""),
      travellers: z.string().max(400).catch(""),
      pickup: z.string().max(120).catch(""),
      amount: z.string().max(120).catch(""),
    })
    .catch({ confirmed: false, summary: "", package: "", dates: "", travellers: "", pickup: "", amount: "" }),
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
/**
 * Learn the way of talking in ONE chat from an imported WhatsApp export of it (the owner, 2026-10-29: Ayush's per-chat voice):
 * the chat in order, both sides, `own` marking the chosen person's messages. It sends what the other side wrote too, so the AI
 * knows what the two talked about; the agency-wide style (learnVoiceInput) never does.
 */
export const learnChatVoiceInput = z.strictObject({
  conversationId: recordId,
  personName: text(80).min(1),
  messages: z
    .array(z.strictObject({ own: z.boolean(), text: z.string().trim().min(1).max(1000) }))
    .max(1500)
    .refine((all) => all.filter((one) => one.own).length >= 5, { message: "At least 5 of their messages" })
    .refine((all) => all.reduce((sum, one) => sum + one.text.length, 0) <= MAX_VOICE_SAMPLE_CHARACTERS),
});
export type LearnChatVoiceInput = z.infer<typeof learnChatVoiceInput>;
export const clearChatVoiceInput = z.strictObject({ conversationId: recordId });

/** What the style-reader must answer (JSON); the context only for a chat's export. */
export const voiceAnswer = z.object({
  profile: z.string().min(1).max(4000),
  examples: z.array(z.string().max(500)).max(40).catch([]),
  context: z.string().max(4000).catch(""),
});

/** A question to try the AI on, from the agency's knowledge alone, before turning it on (Settings, AI). */
export const testAiInput = z.strictObject({ question: text(1000).min(1) });
export const testAiAnswer = z.object({ answer: z.string(), handoff: z.boolean(), reason: z.string() });

/** The AI's last day at a glance, for the AI screen's head. */
export const aiOverview = z.object({
  chatsAnswered: z.int(),
  messagesSent: z.int(),
  /** Middle time from a customer's message to the AI's answer, in seconds; null with none. */
  medianReplySeconds: z.int().nullable(),
  flagged: z.int(),
  followUpsPlanned: z.int(),
  learnings: z.int(),
  /** The model that last answered for the agency (a draft or a score), else null. */
  model: z.string().nullable(),
});
export type AiOverview = z.infer<typeof aiOverview>;
