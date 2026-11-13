// The lite turn's record of itself: the one log line every turn ends with (codes, counts and timings only), and the
// whole turn handed to the trace sink, which plan 3b keeps. The trace may hold the customer's words; a sink that fails
// is logged and never changes what the turn did.
import { randomUUID } from "node:crypto";
import type { AiModel } from "@travel-crm/integrations/ai";
import { errorFields } from "@travel-crm/integrations/logging";
import { promptVersions } from "./prompts/library.js";
import type { LiteWritten } from "./write.js";
import type { LiteDependencies, LiteOutcome, LiteTrace, LiteTurnInput } from "./types.js";

/** What the log line adds to the outcome: codes and counts, never a customer's word. */
export interface TurnLog {
  reason?: string;
  move?: string;
  intents?: string[];
  lookups?: number;
}

export function startTrace(input: LiteTurnInput, leadId: string | null, now: Date): LiteTrace {
  return {
    id: randomUUID(),
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    leadId,
    kind: input.kind,
    startedAt: now,
    durationMs: 0,
    outcome: "",
    reason: null,
    move: null,
    stage: null,
    why: null,
    note: null,
    task: null,
    suggest: null,
    intents: [],
    promptVersions: promptVersions(),
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    messageIds: [],
    understand: null,
    lookups: [],
    checks: [],
    write: null,
    sent: { messageIds: [], text: null },
    actions: [],
  };
}

/** A prompt's blocks but the chat's messages: the trace names those by id. */
export const withoutMessages = (blocks: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(blocks).filter(([title]) => title !== "Messages"));

/** The model as the turn calls it, each answer's model and tokens added to the trace. */
export function tallied(ai: AiModel, trace: LiteTrace): AiModel {
  return {
    configured: ai.configured,
    complete: async (request) => {
      const result = await ai.complete(request);
      if (result.ok) {
        trace.model = result.model;
        trace.inputTokens += result.inputTokens;
        trace.outputTokens += result.outputTokens;
      }
      return result;
    },
  };
}

/** What the Write check refused, and whether its last answer passed. */
export function writeChecks(written: LiteWritten): LiteTrace["checks"] {
  const refused = written.kind === "ok" ? written.refusals : written.kind === "refused" ? [written.code] : [];
  return [
    ...refused.map((code) => ({ name: "write", passed: false, detail: code })),
    ...(written.kind === "ok" ? [{ name: "write", passed: true, detail: null }] : []),
  ];
}

/** Logs the turn's one line, then hands a prepared turn's trace to the sink. */
export async function finishTurn(
  deps: Pick<LiteDependencies, "logger" | "traces">,
  input: LiteTurnInput,
  done: { outcome: LiteOutcome; log: TurnLog; startedMs: number },
  trace: LiteTrace | null,
): Promise<LiteOutcome> {
  const { outcome, log } = done;
  const ms = Date.now() - done.startedMs;
  deps.logger?.info(
    {
      event: "ai.turn",
      agent: "lite",
      outcome,
      ...(log.reason === undefined ? {} : { reason: log.reason }),
      kind: input.kind,
      ...(log.move === undefined ? {} : { move: log.move }),
      ...(log.intents === undefined ? {} : { intents: log.intents }),
      ...(log.lookups === undefined ? {} : { lookups: log.lookups }),
      ms,
    },
    "The lite AI turn ended",
  );
  if (trace !== null && deps.traces !== undefined) {
    try {
      await deps.traces.record({ ...trace, outcome, reason: log.reason ?? null, durationMs: ms });
    } catch (error) {
      deps.logger?.warn(
        { event: "ai.trace-failed", conversationId: input.conversationId, ...errorFields(error) },
        "The lite AI turn's trace could not be kept",
      );
    }
  }
  return outcome;
}
