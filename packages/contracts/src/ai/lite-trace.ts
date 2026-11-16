// A lite turn's trace as its stored file is read back for the console. Every field but the id and the start has a
// default, so a file written before a field was added still opens; one whose fields are not a trace's is refused.
import { z } from "zod";

const blocks = z.record(z.string(), z.string());

export const storedLiteTrace = z.object({
  id: z.string(),
  startedAt: z.coerce.date(),
  conversationId: z.string().default(""),
  leadId: z.string().nullable().default(null),
  kind: z.string().default("reply"),
  durationMs: z.number().default(0),
  outcome: z.string().default(""),
  reason: z.string().nullable().default(null),
  move: z.string().nullable().default(null),
  stage: z.string().nullable().default(null),
  why: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  task: z.string().nullable().default(null),
  suggest: z
    .object({ kind: z.string(), lostReason: z.string().nullable().default(null), reason: z.string() })
    .nullable()
    .default(null),
  intents: z.array(z.string()).default([]),
  promptVersions: z.record(z.string(), z.number()).default({}),
  model: z.string().nullable().default(null),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  messageIds: z.array(z.string()).default([]),
  understand: z.object({ blocks, raw: z.string().nullable() }).nullable().default(null),
  lookups: z.array(z.object({ request: z.looseObject({ tool: z.string() }), result: z.unknown() })).default([]),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string().nullable() })).default([]),
  write: z
    .object({ blocks, raw: z.array(z.string()) })
    .nullable()
    .default(null),
  asked: z.string().nullable().default(null),
  sent: z
    .object({
      messageIds: z.array(z.string()).default([]),
      text: z.string().nullable().default(null),
      filled: z.array(z.object({ start: z.number(), end: z.number() })).default([]),
    })
    .default({ messageIds: [], text: null, filled: [] }),
  actions: z.array(z.string()).default([]),
});
export type StoredLiteTrace = z.output<typeof storedLiteTrace>;

export const storedTraceFile = z.object({ version: z.literal(1), trace: storedLiteTrace });
export type StoredTraceFile = z.output<typeof storedTraceFile>;
