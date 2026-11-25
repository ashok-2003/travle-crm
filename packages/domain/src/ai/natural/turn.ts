// What the natural agent's live turn left the one agent: code's hand-over at the day's cap or a full month, with nothing
// sent and no model call (ruling 5), and the outcome of a turn its gates ended before anything was read.
import type { LiteOutcome } from "../lite/types.js";
import type { CodeHandOverReason } from "./hand-over-words.js";
import type { LiveTurn, TurnAct } from "./turn-act.js";
import { actAndSettle, type TurnDone } from "./turn-done.js";

/** Ruling 5: code's hand-over at a limit, with no model call; nothing goes to the customer (the owner, 2026-11-24). */
export function atLimit(turn: LiveTurn, reason: CodeHandOverReason, task: TurnAct["task"] = null): Promise<TurnDone> {
  return actAndSettle(turn, {
    messages: [],
    staged: new Map(),
    quoted: [],
    handOver: { reason, summary: "" },
    task,
    model: null,
    fallback: null,
  });
}

/** A turn its gates ended before anything was read for the model. */
export const gateDone = (outcome: LiteOutcome): TurnDone => ({
  outcome,
  reason: null,
  messages: [],
  actions: [],
  fallback: null,
  leadId: null,
});
