// A run of the natural turn and what it sends (spec 7): the live agent's request, pinned to the first answer's model and
// bounded by what is left of the turn; the answer as it goes back to the model; and when an answer starts the turn over.
import type { AiEffort, AiMessage, AiRequest, AiResult } from "@travel-crm/integrations/ai";
import type { NaturalContext } from "../context/build.js";
import { withStaged } from "../tools/action-tools.js";
import type { StagedAction, StagedSet } from "../types.js";
import { NATURAL_LIMITS, type LoopSettings, type TurnRun } from "./types.js";

export function freshRun(
  context: NaturalContext,
  forced: readonly StagedAction[],
  model: string | undefined,
  effort: AiEffort,
): TurnRun {
  return {
    messages: [...context.messages],
    staged: forced.reduce<StagedSet>(withStaged, new Map()),
    modelStaged: new Set(),
    quoted: [],
    model,
    effort,
    retried: false,
    nudged: false,
    draft: null,
  };
}

/**
 * The live agent's request (spec 7): no temperature unless Try it chose one, never parallel tool calls (pre-flight #1:
 * no endpoint routes them), and no tools or tool choice on a turn without tools (pre-flight #5).
 */
export function requestOf(
  context: NaturalContext,
  run: TurnRun,
  settings: LoopSettings,
  deadlineAt: number,
  left: number,
): AiRequest {
  return {
    feature: "sales_agent",
    messages: [...run.messages],
    ...(context.tools.length === 0 ? {} : { tools: context.tools, toolChoice: "auto" as const }),
    maxTokens: NATURAL_LIMITS.maxTokens,
    reasoning: { effort: run.effort },
    timeoutMs: Math.min(NATURAL_LIMITS.tryMs, left),
    deadlineAt,
    user: settings.organizationId,
    ...(run.model === undefined ? {} : { model: run.model }),
    ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
  };
}

/**
 * The answer as the model sent it, its reasoning unchanged (Gemini refuses a tool round without its signatures), and the
 * model that wrote it, so the tool round goes back to an endpoint serving it.
 */
export function answerMessage(result: Extract<AiResult, { ok: true }>): AiMessage {
  const calls = result.toolCalls ?? [];
  return {
    role: "assistant",
    content: result.text,
    ...(calls.length === 0 ? {} : { toolCalls: calls }),
    ...(result.reasoningDetails === undefined ? {} : { reasoningDetails: result.reasoningDetails }),
    model: result.model,
  };
}

export interface Restart {
  reason: "bad_request" | "length" | "model";
  model: string | undefined;
  effort: AiEffort;
}

/**
 * Whether an answer starts the turn over (ruling 12, pre-flight #11): a bad request (a lost thought signature) on the
 * same model; a cut-off answer on the model that wrote it, thinking less; and a model the loop pinned that didn't answer
 * on the feature's list again. Try it's own model is never unpinned.
 */
export function restartFor(result: AiResult, run: TurnRun, chosen: string | undefined): Restart | null {
  if (result.ok) {
    return result.finishReason === "length" ? { reason: "length", model: result.model, effort: "minimal" } : null;
  }
  if (result.reason === "bad_request") return { reason: "bad_request", model: run.model, effort: run.effort };
  return run.model !== undefined && chosen === undefined
    ? { reason: "model", model: undefined, effort: run.effort }
    : null;
}
