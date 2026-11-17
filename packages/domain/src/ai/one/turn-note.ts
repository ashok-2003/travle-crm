// How a finished one turn, a reply or a follow-up, is told: natural's note on the turn's trace and its one log line,
// under the agent `one`.
import type { NaturalTrace } from "@travel-crm/contracts/ai";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "../lite/types.js";
import type { TurnDone } from "../natural/turn-done.js";
import { logNaturalTurn, naturalTurnNote } from "../natural/turn-note.js";

/** Notes and logs the turn; its outcome, which the worker keeps. */
export function finishOneTurn(
  deps: Pick<LiteDependencies, "tracing" | "logger">,
  input: LiteTurnInput,
  done: TurnDone,
  trace: NaturalTrace | null,
  ms: number,
): LiteOutcome {
  try {
    deps.tracing?.note(naturalTurnNote(done, trace));
  } catch {
    // A note that fails costs the trace its detail, never the turn.
  }
  logNaturalTurn(deps.logger, input, done, trace?.calls.length ?? 0, ms, "one");
  return done.outcome;
}
