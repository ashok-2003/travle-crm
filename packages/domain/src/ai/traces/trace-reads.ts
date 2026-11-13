// What the console reads of the kept turn traces: index rows (never past 14 days, never of an erased customer) and the
// messages a trace names, read from its own chat as they are kept now.
import type { OrgTx } from "@travel-crm/db";
import { contextMessageOf, storedMessageFields } from "../lite/context/messages.js";
import type { ContextMessage } from "../lite/types.js";

export interface KeptTrace {
  id: string;
  conversationId: string;
  startedAt: Date;
  kind: "reply" | "nudge";
  outcome: string;
  reason: string | null;
  move: string | null;
  saleStage: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  fileKey: string;
}

const columns = {
  id: true,
  conversationId: true,
  startedAt: true,
  kind: true,
  outcome: true,
  reason: true,
  move: true,
  saleStage: true,
  model: true,
  inputTokens: true,
  outputTokens: true,
  durationMs: true,
  fileKey: true,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kept means not yet due, and the chat not erased: an erasure sets the due time, but the sweep may be an hour away. */
const keptAt = (now: Date) => ({ expiresAt: { gt: now }, conversation: { state: { not: "erased" } } });

// The column's CHECK allows reply and nudge only.
const kindOf = (kind: string): KeptTrace["kind"] => (kind === "nudge" ? "nudge" : "reply");

/** Kept traces newest first ([startedAt desc, id desc]); one chat's when conversationId is given. */
export async function keptTraces(
  tx: OrgTx,
  input: { conversationId?: string; cursor?: string; limit: number },
  now: Date,
): Promise<{ traces: KeptTrace[]; nextCursor: string | null }> {
  const rows = await tx.aiTurnTrace.findMany({
    where: { ...keptAt(now), ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }) },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    ...(input.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
    take: input.limit + 1,
    select: columns,
  });
  const page = rows.slice(0, input.limit).map((row) => ({ ...row, kind: kindOf(row.kind) }));
  return { traces: page, nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null };
}

export async function keptTrace(tx: OrgTx, traceId: string, now: Date): Promise<KeptTrace | null> {
  const row = await tx.aiTurnTrace.findFirst({ where: { id: traceId, ...keptAt(now) }, select: columns });
  return row === null ? null : { ...row, kind: kindOf(row.kind) };
}

/** The chat's messages with these ids, in the order given; an id the chat doesn't hold is left out. */
export async function traceMessages(
  tx: OrgTx,
  conversationId: string,
  ids: readonly string[],
): Promise<ContextMessage[]> {
  // The column is a uuid: any other id is simply not found, and must not fail the opening.
  const wanted = ids.filter((id) => UUID.test(id));
  if (wanted.length === 0) return [];
  const rows = await tx.whatsappMessage.findMany({
    where: { conversationId, id: { in: wanted } },
    select: storedMessageFields,
  });
  const byId = new Map(rows.map((row) => [row.id, contextMessageOf(row)]));
  return wanted.flatMap((id) => byId.get(id) ?? []);
}
