// A one turn's row in ai_turn_trace (spec section 11): built from the turn's trace, kept after its note.
import { randomUUID } from "node:crypto";
import type { NaturalTrace } from "@travel-crm/contracts/ai";
import type { LiteTurnInput } from "../lite/types.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import type { TurnDone } from "../natural/turn-done.js";
import type { ToolTurnSink, ToolTurnTrace } from "../traces/trace-sink.js";

const sum = (trace: NaturalTrace, field: "inputTokens" | "outputTokens" | "cachedTokens") =>
  trace.calls.reduce((total, call) => total + call[field], 0);

export function toolTurnRowOf(
  input: LiteTurnInput,
  done: TurnDone,
  trace: NaturalTrace,
  prompt: NaturalPrompt,
  startedAt: Date,
): ToolTurnTrace {
  return {
    id: randomUUID(),
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    leadId: done.leadId,
    kind: input.kind,
    startedAt,
    durationMs: trace.durationMs,
    outcome: done.outcome,
    reason: done.reason,
    model: trace.calls.at(-1)?.model ?? null,
    inputTokens: sum(trace, "inputTokens"),
    outputTokens: sum(trace, "outputTokens"),
    cachedTokens: sum(trace, "cachedTokens"),
    failedChecks: trace.calls.flatMap((call) => call.tools).filter((tool) => tool.refused).length,
    promptVersions: { "real-agent": prompt.source?.version ?? 0 },
  };
}

/** Keeps the turn's row when there is a sink; the sink never throws. */
export async function keepToolTurn(
  sink: ToolTurnSink | undefined,
  input: LiteTurnInput,
  done: TurnDone,
  trace: NaturalTrace,
  prompt: NaturalPrompt,
  startedMs: number,
): Promise<void> {
  await sink?.recordToolTurn(toolTurnRowOf(input, done, trace, prompt, new Date(startedMs)));
}
