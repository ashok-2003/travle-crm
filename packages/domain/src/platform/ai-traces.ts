// The console's lite-agent turn traces: a list of the kept turns, and one turn opened with its file and its chat's
// messages. Every opening is written in the platform log before the file is read; customer words are read only here,
// inside the trace's own organization, and never reach a log line or an error.
import type {
  AiTraceDetail,
  AiTraceInput,
  AiTraceListInput,
  AiTracePage,
  AiTraceRow,
} from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { keptTrace, keptTraces, readTraceFile, traceMessages, type KeptTrace } from "../ai/index.js";
import { findOrganizationRecord } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { traceFileView } from "./ai-trace-detail.js";
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
  const trace = rowView(row, services);
  const priced = services.aiPrices != null;
  const file = await readTraceFile(services.storage, row.fileKey);
  if (file === null) return { trace, priced, file: null };
  const ids = [...new Set([...file.trace.messageIds, ...file.trace.sent.messageIds])];
  const messages = await services.platformDb.transaction((tx) =>
    asOrganization(tx, organizationId, (orgTx) => traceMessages(orgTx, row.conversationId, ids)),
  );
  return { trace, priced, file: traceFileView(file, messages) };
}
