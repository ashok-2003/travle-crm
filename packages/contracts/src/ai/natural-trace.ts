// A natural turn's trace for "Why": each model call with its tool calls, each guard's verdict, what was staged, and
// the flags, with the prompt version the turn ran.
import { z } from "zod";

export const naturalTrace = z.object({
  agent: z.literal("natural"),
  promptVersion: z.string(),
  outcome: z.string(),
  fallback: z.string().nullable(),
  restarted: z.string().nullable(),
  durationMs: z.number(),
  calls: z.array(
    z.object({
      model: z.string(),
      ms: z.number(),
      inputTokens: z.number(),
      cachedTokens: z.number(),
      outputTokens: z.number(),
      reasoningTokens: z.number(),
      finishReason: z.string(),
      words: z.string().nullable(),
      tools: z.array(z.object({ name: z.string(), arguments: z.string(), result: z.string(), refused: z.boolean() })),
    }),
  ),
  guards: z.array(
    z.object({
      guard: z.enum(["G1", "G2", "G3", "G4", "G5", "G6"]),
      passed: z.boolean(),
      detail: z.string().nullable(),
    }),
  ),
  staged: z.array(z.object({ tool: z.string(), summary: z.string() })),
  flags: z.array(z.string()),
});
export type NaturalTrace = z.infer<typeof naturalTrace>;
