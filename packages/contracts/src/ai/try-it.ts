// Try it: the owner plays the customer in a test chat with the AI agent, turn after turn. Each turn sends the chat so far
// and the state the last turn left; it answers what the agent would send, what code would do, the state for the next
// turn, and why (a trace in the console's own shape). Nothing is sent or kept but the month's AI calls.
import { z } from "zod";
import { liteFacts } from "./lite.js";
import { storedLiteTrace } from "./lite-trace.js";

const text = (max: number) => z.string().trim().max(max);

/** The most lines a turn carries: the agent reads the last 20 of them, as a live turn reads a chat. */
export const TEST_CHAT_LINES = 40;
export const TEST_LINE_MAX = 1000;
const SUMMARY_MAX = 1000;

/** One line of the test chat: the customer's (the owner typing as them) or what the agent would have sent. */
export const testAiLine = z.strictObject({ from: z.enum(["customer", "agent"]), text: text(TEST_LINE_MAX).min(1) });
export type TestAiLine = z.infer<typeof testAiLine>;

/** What a turn leaves the next, as a live chat keeps it: the lite agent's facts and its running summary. */
export const testAiState = z.object({ facts: liteFacts, summary: z.string() });
export type TestAiState = z.infer<typeof testAiState>;

export const testAiInput = z.strictObject({
  /** Oldest first, ending with the customer's line this turn answers. */
  messages: z
    .array(testAiLine)
    .min(1)
    .max(TEST_CHAT_LINES)
    .refine((lines) => lines.at(-1)?.from === "customer", { message: "The chat ends with the customer's line" }),
  /** The last turn's state, sent back as it came; null starts a new chat. */
  state: z.strictObject({ facts: z.strictObject(liteFacts.shape), summary: text(SUMMARY_MAX) }).nullable(),
});
export type TestAiInput = z.infer<typeof testAiInput>;

/** What code would do after a reply: send the package's files, book (payment details and the booking), note, add a task. */
export const testAiAction = z.enum(["files", "book", "note", "task"]);
export type TestAiAction = z.infer<typeof testAiAction>;

/** Why the turn did what it did: the parts of a live turn's trace a person testing the agent reads. */
export const testAiTrace = storedLiteTrace
  .pick({ intents: true, move: true, stage: true, why: true, checks: true })
  .extend({
    /** As the stored trace's, but a result is always an object: so it reaches the screen typed, never optional. */
    lookups: z.array(
      z.object({ request: z.looseObject({ tool: z.string() }), result: z.record(z.string(), z.unknown()) }),
    ),
    /** Each Write try: the model's answer as it came, and the check's refusal code, or null when it passed. */
    writes: z.array(z.object({ answer: z.string(), refused: z.string().nullable() })),
    /** The hand-over's reason code, when the turn hands the chat to a person. */
    handOver: z.string().nullable(),
  });
export type TestAiTrace = z.infer<typeof testAiTrace>;

export const testAiAnswer = z.object({
  answer: z.string(),
  handoff: z.boolean(),
  reason: z.string(),
  /** The dry run: what code would do with the reply, or the check's reason code when nothing would be sent. */
  dryRun: z.object({ actions: z.array(testAiAction), blocked: z.string().nullable() }),
  state: testAiState,
  trace: testAiTrace,
});
export type TestAiAnswer = z.infer<typeof testAiAnswer>;
