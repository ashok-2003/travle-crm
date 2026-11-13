// The sink that keeps each lite turn's trace: an index row first, then the gzip file, so no file lacks a row to expire it.
import type { Database } from "@travel-crm/db";
import { errorFields } from "@travel-crm/integrations/logging";
import type { Logger } from "@travel-crm/integrations/logging";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import type { LiteTrace, TraceSink } from "../lite/types.js";
import { TRACE_DAYS, traceFileOf, traceKey } from "./trace-file.js";

const DAY_MS = 86_400_000;

export function createTraceSink(deps: { db: Database; storage: ObjectStorage; logger: Logger }): TraceSink {
  return {
    async record(trace) {
      try {
        const fileKey = traceKey(trace.organizationId, trace.startedAt, trace.id);
        await deps.db.forOrg(trace.organizationId, (tx) => insertRow(tx, trace, fileKey));
        await deps.storage.put({ key: fileKey, contentType: "application/gzip", body: traceFileOf(trace) });
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
