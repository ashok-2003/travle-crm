// The one agent's live turn (spec 3; R4, R7), step for step as natural's: the live prompt (Langfuse's at label
// production, else the built-in text) and natural's reads at once, the earlier system's lines whole; then the tool
// agent's run on the chat, and natural's act in one transaction. At the day's cap or a full month the fallback line goes
// with code's hand-over and no model call; a payment screenshot gets one call with no tools; a model that can't answer
// sends nothing, for the worker to try again; steps that run out end on the fallback line and a task; a booking the act
// refused gets one more run. The whole turn is one trace of its chat, and one log line.
import { randomUUID } from "node:crypto";
import type { LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { newLinesOf } from "../natural/context/chat-turns.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import { prepareNaturalTurn } from "../natural/prepare.js";
import { startNaturalTrace, type NaturalTraceBuilder } from "../natural/trace.js";
import { actOnTurn, type LiveTurn } from "../natural/turn-act.js";
import { actAndSettle, actOfEnd, doneOf, endedOf, type TurnDone } from "../natural/turn-done.js";
import { naturalTurnStart, turnInputOf } from "../natural/turn-note.js";
import { beforeTheModel } from "../natural/turn-reads.js";
import { atLimit, gateDone } from "../natural/turn.js";
import { buildOneContext } from "./context.js";
import { oneLiveIO, type OneTurnDependencies } from "./live-io.js";
import { runOneLoop, type OneSettings } from "./loop.js";
import { runOneNudge } from "./nudge.js";
import { onePromptOf } from "./prompt.js";
import { finishOneTurn } from "./turn-note.js";
import { keepToolTurn } from "./turn-row.js";
import { afterOneRefusal } from "./turn-refused.js";

export type { OneTurnDependencies } from "./live-io.js";

async function liveTurn(
  deps: OneTurnDependencies,
  turn: LiveTurn,
  prompt: NaturalPrompt,
  trace: NaturalTraceBuilder,
  clock: () => number,
): Promise<TurnDone> {
  const { input, now, prepared } = turn;
  const lastTurnAt = prepared.facts.lastTurnAt === null ? null : new Date(prepared.facts.lastTurnAt);
  const newLines = newLinesOf(prepared.lines, lastTurnAt);
  const customerText = newLines.map((line) => line.text).join("\n");
  deps.tracing?.note({ input: turnInputOf(newLines) });
  if (prepared.monthFull) return atLimit(turn, "month_limit", customerText);
  if (prepared.repliesToday >= prepared.dayCap) return atLimit(turn, "day_cap", customerText);
  const before = beforeTheModel(newLines);
  const tools = before.withTools ? "all" : "none";
  const context = buildOneContext({ ...prepared, prompt, now, notice: before.notice, tools, summary: null });
  const io = oneLiveIO(deps, prepared, input, context, now, clock);
  const settings: OneSettings = { organizationId: input.organizationId, forced: before.forced, today: prepared.today };
  const end = await runOneLoop(context, io, settings, trace);
  switch (end.end) {
    case "superseded":
      return endedOf(turn, "superseded", null);
    case "model_failed":
      // The month's last call went to another chat while this one ran: as at the limit.
      if (end.reason === "limit") return atLimit(turn, "month_limit", customerText);
      return endedOf(turn, "model_failed", end.reason);
    case "fallback":
      return actAndSettle(turn, actOfEnd(end));
    case "final": {
      const act = actOfEnd(end);
      const result = await actOnTurn(turn, act);
      if ("refused" in result)
        return afterOneRefusal(turn, { context, io, settings, trace }, end, result, customerText);
      return doneOf(turn, act, result);
    }
  }
}

/** A reply, or the gates' outcome; a follow-up goes to runOneNudge. Each turn one trace and one log line. */
export async function runOneTurn(deps: OneTurnDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome> {
  if (input.kind === "nudge") return runOneNudge(deps, input, now);
  const clock = () => deps.clock?.().getTime() ?? Date.now();
  const startedMs = clock();
  const [prompt, prepared] = await Promise.all([
    onePromptOf(deps.prompts),
    prepareNaturalTurn(deps, input, now, { earlierWhole: true }),
  ]);
  const leadId = typeof prepared === "string" ? null : prepared.leadId;
  const work = async () => {
    if (typeof prepared === "string") return finishOneTurn(deps, input, gateDone(prepared), null, clock() - startedMs);
    const turn: LiveTurn = { deps, input, now, prepared, traceId: randomUUID(), actions: [] };
    const trace = startNaturalTrace(prompt, startedMs, "one");
    const done = await liveTurn(deps, turn, prompt, trace, clock);
    const ended = clock();
    const finished = trace.finish(done.outcome, done.fallback, ended);
    const outcome = finishOneTurn(deps, input, done, finished, ended - startedMs);
    await keepToolTurn(deps.toolTurns, input, done, finished, prompt, startedMs);
    return outcome;
  };
  return deps.tracing === undefined ? work() : deps.tracing.turn(naturalTurnStart(input, prompt, leadId, "one"), work);
}
