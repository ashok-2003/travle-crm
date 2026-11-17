// The one agent after the act refused its booking (natural's ruling 7; R7): the seats went, a hold was there already or
// the price changed, the act rolled back, and nothing went. The model runs once more on its own transcript and the app's
// check of what happened, with the turn's other actions kept and the money left to it; refused again, or with no
// answer, the customer gets the fallback line and the team a task saying what wasn't done. No call or time cap:
// LangGraph's steps bound the run.
import { without } from "../natural/loop/ends.js";
import type { LoopEnd } from "../natural/loop/types.js";
import { appCheck } from "../natural/loop/words.js";
import type { NaturalTraceBuilder } from "../natural/trace.js";
import { actOnTurn, MONEY_ACTIONS, type LiveTurn } from "../natural/turn-act.js";
import { actAndSettle, actOfEnd, doneOf, endedOf, type TurnDone } from "../natural/turn-done.js";
import { refusalNote, refusedAct, type Refused } from "../natural/turn-refused.js";
import type { StagedSet } from "../natural/types.js";
import type { OneContext } from "./context.js";
import { runOneLoop, type OneLoopIO, type OneSettings } from "./loop.js";

/** The fallback line and the team's task, with the turn's actions kept but what reaches the customer. */
function refusedFallback(
  turn: LiveTurn,
  trace: NaturalTraceBuilder,
  staged: StagedSet,
  refused: Refused,
  customerText: string,
): Promise<TurnDone> {
  const act = refusedAct(turn, staged, refused, customerText);
  trace.staged(act.staged);
  return actAndSettle(turn, act);
}

export async function afterOneRefusal(
  turn: LiveTurn,
  loop: { context: OneContext; io: OneLoopIO; settings: OneSettings; trace: NaturalTraceBuilder },
  end: Extract<LoopEnd, { end: "final" }>,
  refused: Refused,
  customerText: string,
): Promise<TurnDone> {
  const { context, io, settings, trace } = loop;
  const note = await refusalNote(turn, end.staged, refused);
  const again = await runOneLoop(
    { ...context, messages: [...end.transcript, appCheck(note)] },
    io,
    {
      ...settings,
      // The model that wrote the transcript goes on with it (P7), unless Try it named its own.
      model: settings.model ?? end.model,
      // The model re-decides the money: the turn's other actions stay forced; book and resend_payment are left out.
      forced: [...without(end.staged, MONEY_ACTIONS).values()],
    },
    trace,
  );
  switch (again.end) {
    case "superseded":
      return endedOf(turn, "superseded", null);
    // The team's task names the booking not done, whatever ended the run.
    case "model_failed":
    case "fallback":
      return refusedFallback(turn, trace, end.staged, refused, customerText);
    case "final": {
      // The customer said yes and nothing went: a reply is owed, so a silent end (stay_quiet alone) falls back.
      if (again.messages.length === 0) return refusedFallback(turn, trace, end.staged, refused, customerText);
      const act = actOfEnd(again);
      const result = await actOnTurn(turn, act);
      if ("refused" in result) return refusedFallback(turn, trace, again.staged, result, customerText);
      return doneOf(turn, act, result);
    }
  }
}
