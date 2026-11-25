// What the console reads of the kept turn traces: index rows, never past 14 days, never of an erased customer.
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../../kernel/index.js";

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
} as const;

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
  // Paged by the cursor row's values, so a row that has gone out of the kept set since the last page (an erasure) still
  // marks the place; one the sweep deleted can't, and is said, not read as the end of the list.
  const after =
    input.cursor === undefined
      ? null
      : await tx.aiTurnTrace.findFirst({ where: { id: input.cursor }, select: { id: true, startedAt: true } });
  if (input.cursor !== undefined && after === null)
    throw new DomainError("NOT_FOUND", "AI_TRACE_CURSOR_GONE", "That place in the list is gone");
  const rows = await tx.aiTurnTrace.findMany({
    where: {
      ...keptAt(now),
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      ...(after === null
        ? {}
        : {
            OR: [{ startedAt: { lt: after.startedAt } }, { startedAt: after.startedAt, id: { lt: after.id } }],
          }),
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
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
