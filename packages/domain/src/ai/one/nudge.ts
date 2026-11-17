// The one agent's follow-up (natural's ruling 13): the reply's reads with natural's follow-up gates on top (fewer than
// two sent, the silence unbroken, an open lead, waking hours), then one run whose only tool is stay_quiet, then the same
// act as a reply's. A line that can't be had or is refused sends nothing and tells nobody: a follow-up is a courtesy,
// never an answer owed, so it has no fallback line and no retry.
import { randomUUID } from "node:crypto";
import type { LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { stampOf } from "../natural/context/chat-turns.js";
import { nudgeGate, nudgeNotice } from "../natural/nudge-turn.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import { prepareNaturalTurn } from "../natural/prepare.js";
import { startNaturalTrace, type NaturalTraceBuilder } from "../natural/trace.js";
import { actOnTurn, type LiveTurn } from "../natural/turn-act.js";
import { actOfEnd, doneOf, endedOf, type TurnDone } from "../natural/turn-done.js";
import { naturalTurnStart } from "../natural/turn-note.js";
import { gateDone } from "../natural/turn.js";
import { buildOneContext } from "./context.js";
import { oneLiveIO, type OneTurnDependencies } from "./live-io.js";
import { runOneLoop } from "./loop.js";
import { onePromptOf } from "./prompt.js";
import { finishOneTurn } from "./turn-note.js";

async function followUp(
  deps: OneTurnDependencies,
  turn: LiveTurn,
  prompt: NaturalPrompt,
  number: number,
  clock: () => number,
  trace: NaturalTraceBuilder,
): Promise<TurnDone> {
  const { input, now, prepared } = turn;
  const { facts, timeZone, today } = prepared;
  const quiet = facts.lastTurnAt === null ? now : new Date(facts.lastTurnAt);
  const notice = nudgeNotice(number, stampOf(quiet, { today, timeZone }));
  const context = buildOneContext({ ...prepared, prompt, now, notice, tools: "stay_quiet", summary: null });
  const io = oneLiveIO(deps, prepared, input, context, now, clock);
  const end = await runOneLoop(context, io, { organizationId: input.organizationId, forced: [], today }, trace);
  switch (end.end) {
    case "superseded":
      return endedOf(turn, "superseded", null);
    // No fallback line, no retry, no task: the customer asked nothing of us.
    case "model_failed":
    case "fallback":
      return endedOf(turn, "nothing", end.reason);
    case "final": {
      const act = actOfEnd(end);
      const result = await actOnTurn(turn, act);
      return "refused" in result ? endedOf(turn, "blocked", result.refused) : doneOf(turn, act, result);
    }
  }
}

/** The follow-up for a customer gone quiet: one trace of its chat, one log line; the outcome is what the worker keeps. */
export async function runOneNudge(deps: OneTurnDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome> {
  const clock = () => deps.clock?.().getTime() ?? Date.now();
  const startedMs = clock();
  const [prompt, prepared] = await Promise.all([
    onePromptOf(deps.prompts),
    prepareNaturalTurn(deps, input, now, { earlierWhole: true }),
  ]);
  const leadId = typeof prepared === "string" ? null : prepared.leadId;
  const work = async () => {
    const gated = (outcome: LiteOutcome) =>
      finishOneTurn(deps, input, { ...gateDone(outcome), leadId }, null, clock() - startedMs);
    if (typeof prepared === "string") return gated(prepared);
    const number = await nudgeGate(deps, input, prepared, now);
    if (typeof number === "string") return gated(number);
    const turn: LiveTurn = { deps, input, now, prepared, traceId: randomUUID(), actions: [] };
    const trace = startNaturalTrace(prompt, startedMs, "one");
    const done = await followUp(deps, turn, prompt, number, clock, trace);
    const ended = clock();
    return finishOneTurn(deps, input, done, trace.finish(done.outcome, done.fallback, ended), ended - startedMs);
  };
  return deps.tracing === undefined ? work() : deps.tracing.turn(naturalTurnStart(input, prompt, leadId, "one"), work);
}
