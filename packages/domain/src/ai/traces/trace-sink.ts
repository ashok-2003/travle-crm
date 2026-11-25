// The sink that keeps each one agent turn's row of ai_turn_trace (Langfuse holds its detail), and the sweep's reads of
// the rows due. Rows of earlier agents may still name a file (fileKey), which the sweep deletes with them.
import type { Database, OrgTx } from "@travel-crm/db";
import { errorFields } from "@travel-crm/integrations/logging";
import type { Logger } from "@travel-crm/integrations/logging";

/** How long a trace is kept. */
export const TRACE_DAYS = 14;
const DAY_MS = 86_400_000;
/** The longest a turn waits for its trace to be kept. */
const TRACE_WRITE_LIMIT_MS = 5_000;

/** Rejects with a TimeoutError once `ms` pass, whatever `work` is doing. */
function withinLimit(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("The trace was not kept in time");
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  return Promise.race([work, late]).finally(() => {
    clearTimeout(timer);
  });
}

/** A one turn's row: ids, counts, codes and timings, never words. */
export interface ToolTurnTrace {
  id: string;
  organizationId: string;
  conversationId: string;
  leadId: string | null;
  kind: "reply" | "nudge";
  startedAt: Date;
  durationMs: number;
  outcome: string;
  reason: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Tool results that were refused. */
  failedChecks: number;
  /** { "real-agent": the Langfuse version, 0 for the built-in text }. */
  promptVersions: Record<string, number>;
}

export interface ToolTurnSink {
  recordToolTurn(trace: ToolTurnTrace): Promise<void>;
}

export function createTraceSink(deps: { db: Database; logger: Logger; timeoutMs?: number }): ToolTurnSink {
  /** The row; a failure or a slow store is one warn line, never the turn's. */
  async function keep(turn: ToolTurnTrace) {
    try {
      const write = async () => {
        await deps.db.forOrg(turn.organizationId, (tx) => insertToolTurnRow(tx, turn));
      };
      await withinLimit(write(), deps.timeoutMs ?? TRACE_WRITE_LIMIT_MS);
    } catch (error) {
      // A trace is for debugging: losing one never changes what the turn did, and the line holds no customer words.
      deps.logger.warn(
        { event: "ai.trace-failed", traceId: turn.id, ...errorFields(error) },
        "A turn's trace was lost",
      );
    }
  }
  return { recordToolTurn: keep };
}

type Transaction = Parameters<Parameters<Database["forOrg"]>[1]>[0];

/** When a trace is due: a turn that ran while its customer was erased is due at once, not 14 days on. */
async function expiryOf(tx: Transaction, trace: { conversationId: string; startedAt: Date }): Promise<Date> {
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: trace.conversationId },
    select: { state: true },
  });
  return new Date(trace.startedAt.getTime() + (chat?.state === "erased" ? 0 : TRACE_DAYS * DAY_MS));
}

function insertToolTurnRow(tx: Transaction, turn: ToolTurnTrace) {
  return expiryOf(tx, turn).then((expiresAt) =>
    tx.aiTurnTrace.create({
      data: {
        id: turn.id,
        conversationId: turn.conversationId,
        leadId: turn.leadId,
        startedAt: turn.startedAt,
        kind: turn.kind,
        agent: "one",
        outcome: turn.outcome,
        reason: turn.reason,
        model: turn.model,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        cachedTokens: turn.cachedTokens,
        durationMs: turn.durationMs,
        failedChecks: turn.failedChecks,
        promptVersions: turn.promptVersions,
        expiresAt,
      },
    }),
  );
}

/**
 * The traces past their time, and every one of an erased chat however late it was written, oldest first, whatever their
 * organization (run on the platform's transaction), without those already `visited` this run (a row whose file would
 * not delete stays, and must not be listed forever).
 */
export function tracesDue(
  tx: OrgTx,
  now: Date,
  limit: number,
  visited: readonly string[] = [],
): Promise<{ id: string; organizationId: string; fileKey: string | null }[]> {
  return tx.aiTurnTrace.findMany({
    where: {
      OR: [{ expiresAt: { lte: now } }, { conversation: { state: "erased" } }],
      id: { notIn: [...visited] },
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { id: true, organizationId: true, fileKey: true },
  });
}

/** Deletes these traces' rows (their files are gone); only the platform role may. Returns how many went. */
export async function forgetTraces(tx: OrgTx, ids: readonly string[]): Promise<number> {
  const deleted = await tx.aiTurnTrace.deleteMany({ where: { id: { in: [...ids] } } });
  return deleted.count;
}
