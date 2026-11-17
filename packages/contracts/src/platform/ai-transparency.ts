// What the console shows super admins of the lite WhatsApp agent: its prompt library, and its kept turn traces.
import { z } from "zod";
import { recordId } from "../identity/index.js";

export const aiPromptPiece = z.object({
  name: z.string(),
  version: z.int().min(1),
  changedOn: z.iso.date(),
  text: z.string(),
});
export type AiPromptPiece = z.infer<typeof aiPromptPiece>;

export const aiModelCall = z.object({
  name: z.enum(["understand", "write"]),
  system: z.array(z.string()),
  blocks: z.array(z.object({ title: z.string(), purpose: z.string(), budget: z.int() })),
  answer: z.string(),
  lookups: z.array(z.string()),
});
export type AiModelCall = z.infer<typeof aiModelCall>;

export const aiPromptLibrary = z.object({ pieces: z.array(aiPromptPiece), calls: z.array(aiModelCall) });
export type AiPromptLibrary = z.infer<typeof aiPromptLibrary>;

export const aiTraceListInput = z.strictObject({
  organizationId: recordId,
  conversationId: recordId.optional(),
  cursor: recordId.optional(),
  limit: z.int().min(1).max(100).default(50),
});
export type AiTraceListInput = z.infer<typeof aiTraceListInput>;

export const aiTraceInput = z.strictObject({ organizationId: recordId, traceId: recordId });
export type AiTraceInput = z.infer<typeof aiTraceInput>;

/** One turn's index row. `costPaise` is null when the console has no token prices set. */
export const aiTraceRow = z.object({
  id: recordId,
  conversationId: recordId,
  startedAt: z.iso.datetime(),
  kind: z.enum(["reply", "nudge"]),
  outcome: z.string(),
  reason: z.string().nullable(),
  move: z.string().nullable(),
  saleStage: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
  durationMs: z.int().min(0),
  costPaise: z.int().min(0).nullable(),
});
export type AiTraceRow = z.infer<typeof aiTraceRow>;

export const aiTracePage = z.object({
  traces: z.array(aiTraceRow),
  nextCursor: recordId.nullable(),
  priced: z.boolean(),
});
export type AiTracePage = z.infer<typeof aiTracePage>;

export const aiTraceMessage = z.object({
  id: recordId,
  from: z.enum(["customer", "you", "team"]),
  at: z.iso.datetime(),
  kind: z.string(),
  text: z.string(),
});
export type AiTraceMessage = z.infer<typeof aiTraceMessage>;

const aiTraceBlock = z.object({ title: z.string(), text: z.string() });

export const aiTraceFile = z.object({
  intents: z.array(z.string()),
  promptVersions: z.array(z.object({ name: z.string(), used: z.int(), current: z.int().nullable() })),
  understand: z.object({ blocks: z.array(aiTraceBlock), answer: z.string().nullable() }).nullable(),
  messages: z.array(aiTraceMessage),
  messagesGone: z.int().min(0),
  lookups: z.array(z.object({ tool: z.string(), request: z.string(), result: z.string() })),
  decision: z.object({
    why: z.string().nullable(),
    note: z.string().nullable(),
    task: z.string().nullable(),
    suggest: z.object({ kind: z.string(), reason: z.string() }).nullable(),
  }),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string().nullable() })),
  write: z.object({ blocks: z.array(aiTraceBlock), answers: z.array(z.string()) }).nullable(),
  sent: z.object({ text: z.string().nullable(), messages: z.array(aiTraceMessage) }),
  actions: z.array(z.string()),
});
export type AiTraceFile = z.infer<typeof aiTraceFile>;

/** `file` is null when the turn's file is missing or can't be read. */
export const aiTraceDetail = z.object({ trace: aiTraceRow, priced: z.boolean(), file: aiTraceFile.nullable() });
export type AiTraceDetail = z.infer<typeof aiTraceDetail>;
