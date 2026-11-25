// What the console shows super admins of the WhatsApp agent: its kept turn traces' rows.
import { z } from "zod";
import { recordId } from "../identity/index.js";

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

/** One turn opened. */
export const aiTraceDetail = z.object({ trace: aiTraceRow, priced: z.boolean() });
export type AiTraceDetail = z.infer<typeof aiTraceDetail>;
