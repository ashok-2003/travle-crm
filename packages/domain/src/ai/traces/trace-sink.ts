// The sink that keeps each lite turn's trace: an index row first, then the gzip file, so no file lacks a row to expire it.
import type { Database, OrgTx } from "@travel-crm/db";
import { errorFields } from "@travel-crm/integrations/logging";
import type { Logger } from "@travel-crm/integrations/logging";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import type { LiteTrace, TraceSink } from "../lite/types.js";
import { TRACE_DAYS, traceFileOf, traceKey } from "./trace-file.js";

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

export function createTraceSink(deps: {
  db: Database;
  storage: ObjectStorage;
  logger: Logger;
  timeoutMs?: number;
}): TraceSink {
  return {
    async record(trace) {
      try {
        const fileKey = traceKey(trace.organizationId, trace.startedAt, trace.id);
        const keep = async () => {
          // A row whose file never arrived is expected (a lost put): readers treat a missing file as null.
          await deps.db.forOrg(trace.organizationId, (tx) => insertRow(tx, trace, fileKey));
          await deps.storage.put({ key: fileKey, contentType: "application/gzip", body: traceFileOf(trace) });
        };
        await withinLimit(keep(), deps.timeoutMs ?? TRACE_WRITE_LIMIT_MS);
      } catch (error) {
        // A trace is for debugging: losing one never changes what the turn did, and the line holds no customer words.
        deps.logger.warn(
          { event: "ai.trace-failed", traceId: trace.id, ...errorFields(error) },
          "A turn's trace was lost",
        );
      }
    },
  };
}

type Transaction = Parameters<Parameters<Database["forOrg"]>[1]>[0];

function insertRow(tx: Transaction, trace: LiteTrace, fileKey: string) {
  return tx.aiTurnTrace.create({
    data: {
      id: trace.id,
      conversationId: trace.conversationId,
      leadId: trace.leadId,
      startedAt: trace.startedAt,
      kind: trace.kind,
      outcome: trace.outcome,
      reason: trace.reason,
      move: trace.move,
      saleStage: trace.stage,
      model: trace.model,
      inputTokens: trace.inputTokens,
      outputTokens: trace.outputTokens,
      durationMs: trace.durationMs,
      promptVersions: trace.promptVersions,
      fileKey,
      expiresAt: new Date(trace.startedAt.getTime() + TRACE_DAYS * DAY_MS),
    },
  });
}

/**
 * The traces past their time, oldest first, whatever their organization (run on the platform's transaction), without
 * those already `visited` this run (a row whose file would not delete stays, and must not be listed forever).
 */
export function tracesDue(
  tx: OrgTx,
  now: Date,
  limit: number,
  visited: readonly string[] = [],
): Promise<{ id: string; organizationId: string; fileKey: string }[]> {
  return tx.aiTurnTrace.findMany({
    where: { expiresAt: { lte: now }, id: { notIn: [...visited] } },
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
