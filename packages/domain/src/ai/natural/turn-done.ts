// How a live natural turn ends (plan 2, Task 6): the loop's end as the act takes it, and the turn's outcome after the
// act: the fallback (a task), a hand-over, nothing sent (quiet) or a reply; or the outcome of a turn the act gave way in.
import type { LiteOutcome } from "../lite/types.js";
import { stagedOf } from "./act-types.js";
import type { LoopEnd } from "./loop.js";
import { actOnTurn, type ActEnd, type LiveTurn, type TurnAct } from "./turn-act.js";

/** How the turn ended, for its trace and its log line. */
export interface TurnDone {
  outcome: LiteOutcome;
  /** A code: the hand-over's reason, the fallback's, the model's failure, a refusal's. */
  reason: string | null;
  /** The words that went to the customer. */
  messages: string[];
  actions: string[];
  fallback: string | null;
  leadId: string | null;
}

/** The loop's end as the act takes it: the reply, or the fallback's task for the team. */
export function actOfEnd(end: Extract<LoopEnd, { end: "final" | "fallback" }>): TurnAct {
  if (end.end === "final") {
    const { messages, staged, quoted, model } = end;
    return { messages, staged, quoted, handOver: null, task: null, model, fallback: null };
  }
  const task = { kind: "question" as const, text: end.task };
  return {
    messages: [],
    staged: end.staged,
    quoted: [],
    handOver: null,
    task,
    model: null,
    fallback: end.reason,
  };
}

/** The turn's end when the act did not run, or wrote nothing. */
export function endedOf(
  turn: LiveTurn,
  outcome: LiteOutcome,
  reason: string | null,
  fallback: string | null = null,
): TurnDone {
  return { outcome, reason, messages: [], actions: turn.actions, fallback, leadId: turn.prepared.leadId };
}

/** The turn's end after the act: the fallback, a hand-over, nothing sent (quiet) or a reply. */
export function doneOf(turn: LiveTurn, act: TurnAct, result: Exclude<ActEnd, { refused: string }>): TurnDone {
  if ("ended" in result) return endedOf(turn, result.ended, result.reason, act.fallback);
  const handOver = act.handOver?.reason ?? stagedOf(act.staged, "hand_over")?.reason ?? null;
  const outcome =
    act.fallback !== null
      ? "fallback"
      : result.handedOver
        ? "handed_off"
        : result.sentIds.length === 0
          ? "quiet"
          : "replied";
  return {
    outcome,
    reason: act.fallback ?? (result.handedOver ? handOver : null),
    messages: result.sentIds.length === 0 ? [] : act.messages,
    actions: [...turn.actions, ...result.actions],
    fallback: act.fallback,
    leadId: result.leadId,
  };
}

/** Acts on a turn with no money staged (the fallback, a limit's hand-over), which the act never refuses. */
export async function actAndSettle(turn: LiveTurn, act: TurnAct): Promise<TurnDone> {
  const result = await actOnTurn(turn, act);
  return "refused" in result ? endedOf(turn, "blocked", result.refused, act.fallback) : doneOf(turn, act, result);
}
