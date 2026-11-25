// Try it: the owner plays the customer in a test chat with the AI agent, turn after turn. Each turn sends the chat so far
// (its lines' shape here; the one agent's input and answer are in one-try-it.ts and natural-try-it.ts). Nothing is sent
// or kept but the month's AI calls.
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

/** The most lines a turn carries: the agent reads the last 20 of them, as a live turn reads a chat. */
export const TEST_CHAT_LINES = 40;
export const TEST_LINE_MAX = 1000;

/** One line of the test chat: the customer's (the owner typing as them) or what the agent would have sent. */
export const testAiLine = z.strictObject({ from: z.enum(["customer", "agent"]), text: text(TEST_LINE_MAX).min(1) });
export type TestAiLine = z.infer<typeof testAiLine>;

/** The chat every Try it turn posts; the one agent's input adds its own state (one-try-it.ts). */
export const testAiInput = z.strictObject({
  /** Oldest first, ending with the customer's line this turn answers. */
  messages: z
    .array(testAiLine)
    .min(1)
    .max(TEST_CHAT_LINES)
    .refine((lines) => lines.at(-1)?.from === "customer", { message: "The chat ends with the customer's line" }),
});
export type TestAiInput = z.infer<typeof testAiInput>;
