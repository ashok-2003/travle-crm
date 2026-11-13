// The AI's autopilot (AI step 2; the owner's decisions of 2026-10-28): the one WhatsApp agent answers chats by itself.
// Off until an Owner or Admin turns it on; every message it sends is marked as the AI's in the chat and audited. This
// file holds a chat's state as the inbox shows it, the events and job of its turns, Try it, and the day's overview.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

const text = (max: number) => z.string().trim().max(max);

export const aiChatModes = ["default", "on", "off"] as const;
export const aiChatMode = z.enum(aiChatModes);
export const conversationAiInput = z.strictObject({ conversationId: recordId });
export const setChatAiInput = z.strictObject({ conversationId: recordId, mode: aiChatMode });

/** A chat as the inbox shows the AI in it. */
export const chatAi = z.object({
  mode: aiChatMode,
  /** Whether the AI answers in this chat now: the mode, else the agency's autopilot. */
  answering: z.boolean(),
  handedOff: z.boolean(),
  handoffReason: z.string().nullable(),
  memory: z.string(),
  /** The lite agent's notes on the customer, shown as "What the AI noted"; empty when it has none. */
  summary: z.string(),
  lastReplyAt: z.iso.datetime().nullable(),
  /** What it is doing now: waiting a moment for the customer's next line, or writing its answer. */
  turn: z.enum(["queued", "thinking"]).nullable(),
  followUpAt: z.iso.datetime().nullable(),
  followUpReason: z.string().nullable(),
  /** What it flagged for the team while it kept answering ("wants to book"), recently. */
  attention: z.string().nullable(),
  /** Until when it waits because someone on the team wrote in the chat; null when it isn't waiting. */
  personPausedUntil: z.iso.datetime().nullable(),
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

/** A question to try the AI agent on, from the agency's packages and setup, before turning it on. */
export const testAiInput = z.strictObject({ question: text(1000).min(1) });
/** What code would do after a reply: send the package's files, book (payment details and the booking), note, add a task. */
export const testAiAction = z.enum(["files", "book", "note", "task"]);
export type TestAiAction = z.infer<typeof testAiAction>;

export const testAiAnswer = z.object({
  answer: z.string(),
  handoff: z.boolean(),
  reason: z.string(),
  /** The dry run: what code would do with the reply, or the check's reason code when nothing would be sent. */
  grounded: z.object({ actions: z.array(testAiAction), blocked: z.string().nullable() }),
});
export type TestAiAnswer = z.infer<typeof testAiAnswer>;

/** The AI's last day at a glance, for the AI screen's head. */
export const aiOverview = z.object({
  chatsAnswered: z.int(),
  messagesSent: z.int(),
  /** Chats in the last 24 hours handed over, told to the team, or whose lead the AI suggested Lost or Not a lead; each once. */
  flagged: z.int(),
  /** Bookings the AI took in the last 24 hours. */
  bookingsRequested: z.int(),
});
export type AiOverview = z.infer<typeof aiOverview>;
