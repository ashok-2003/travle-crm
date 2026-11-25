// The console's agent turn traces: a list of the kept turns' rows (ids, counts, codes and timings, never words), and one
// turn opened, written in the platform log. A one agent turn's detail is in Langfuse, not here.
import type {
  AiTraceDetail,
  AiTraceInput,
  AiTraceListInput,
  AiTracePage,
  AiTraceRow,
} from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { keptTrace, keptTraces, type KeptTrace } from "../ai/index.js";
import { findOrganizationRecord } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import { tokenCostPaise, type PlatformServices } from "./services.js";

function rowView(row: KeptTrace, services: PlatformServices): AiTraceRow {
  return {
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind,
    outcome: row.outcome,
    reason: row.reason,
    move: row.move,
    saleStage: row.saleStage,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    durationMs: row.durationMs,
    startedAt: row.startedAt.toISOString(),
    costPaise:
      services.aiPrices == null
        ? null
        : tokenCostPaise(services.aiPrices, { input: row.inputTokens, output: row.outputTokens }),
  };
}

export async function listAiTraces(
  services: PlatformServices,
  input: AiTraceListInput,
  now: Date = new Date(),
): Promise<AiTracePage> {
  const page = await services.platformDb.transaction(async (tx) => {
    await findOrganizationRecord(tx, input.organizationId);
    return asOrganization(tx, input.organizationId, (orgTx) =>
      keptTraces(
        orgTx,
        {
          limit: input.limit,
          ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        },
        now,
      ),
    );
  });
  return {
    traces: page.traces.map((row) => rowView(row, services)),
    nextCursor: page.nextCursor,
    priced: services.aiPrices != null,
  };
}

export async function openAiTrace(
  services: PlatformServices,
  staff: PlatformActor,
  input: AiTraceInput,
  now: Date = new Date(),
): Promise<AiTraceDetail> {
  if (staff.userId === null) throw new RangeError("Only a signed-in platform admin opens a trace");
  const { organizationId, traceId } = input;
  // The row is found and the opening logged in one transaction: a refused opening writes nothing.
  const row = await services.platformDb.transaction(async (tx) => {
    await findOrganizationRecord(tx, organizationId);
    const found = await asOrganization(tx, organizationId, (orgTx) => keptTrace(orgTx, traceId, now));
    if (found === null) throw new DomainError("NOT_FOUND", "AI_TRACE_NOT_FOUND", "No such trace");
    await recordPlatformAudit(tx, staff, {
      action: "ai-trace.opened",
      targetType: "ai_turn_trace",
      targetId: traceId,
      targetOrganizationId: organizationId,
    });
    return found;
  });
  return { trace: rowView(row, services), priced: services.aiPrices != null };
}
