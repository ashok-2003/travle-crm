// The natural agent's live turn (spec 3.2; plan 2, Task 6): the live reads and the live prompt (Langfuse's at label
// production, else the built-in text) at once, then Plan 1's loop on the chat, then the act in one transaction. At the
// day's cap or a full month the fallback line goes with code's own hand-over and no model call (ruling 5); a payment
// screenshot or a voice note nobody could play gets one call with no tools (ruling 6); a model that can't answer ends
// `model_failed` with nothing sent, for the worker to try again (ruling 6); a booking the act refused gets one more call
// (ruling 7). The whole turn is one trace of its chat, and one log line.
import { randomUUID } from "node:crypto";
import type { NaturalTrace } from "@travel-crm/contracts/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { AiTracing, TurnStart } from "@travel-crm/integrations/tracing";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { buildNaturalContext } from "./context/build.js";
import { newLinesOf } from "./context/chat-turns.js";
import { fallbackLine } from "./fallback-line.js";
import type { CodeHandOverReason } from "./hand-over-words.js";
import { liveLoopIO } from "./live-io.js";
import { runNaturalLoop, type LoopSettings } from "./loop.js";
import { prepareNaturalTurn } from "./prepare.js";
import type { NaturalPrompt } from "./prompt.js";
import { naturalPromptOf } from "./prompt-source.js";
import { startNaturalTrace, type NaturalTraceBuilder } from "./trace.js";
import { actOnTurn, type LiveTurn } from "./turn-act.js";
import { actAndSettle, actOfEnd, doneOf, endedOf, type TurnDone } from "./turn-done.js";
import { logNaturalTurn, naturalTurnNote, naturalTurnStart, turnInputOf } from "./turn-note.js";
import { afterRefusal } from "./turn-refused.js";
import { beforeTheModel } from "./turn-reads.js";

export interface NaturalTurnDependencies extends LiteDependencies {
  /** Langfuse's prompts: the turn runs on the prompt at label production, else on the built-in text. */
  prompts?: AiPrompts;
}

/** Ruling 5: the fallback line and code's hand-over at a limit, with no model call. */
function atLimit(turn: LiveTurn, reason: CodeHandOverReason, customerText: string): Promise<TurnDone> {
  return actAndSettle(turn, {
    messages: [fallbackLine(customerText)],
    staged: new Map(),
    quoted: [],
    handOver: { reason, summary: "" },
    task: null,
    model: null,
    fallback: null,
  });
}

async function liveTurn(
  turn: LiveTurn,
  prompt: NaturalPrompt,
  trace: NaturalTraceBuilder,
  timing: { startedMs: number; clock: () => number },
): Promise<TurnDone> {
  const { deps, input, now, prepared } = turn;
  const lastTurnAt = prepared.facts.lastTurnAt === null ? null : new Date(prepared.facts.lastTurnAt);
  const newLines = newLinesOf(prepared.lines, lastTurnAt);
  const customerText = newLines.map((line) => line.text).join("\n");
  deps.tracing?.note({ input: turnInputOf(newLines) });
  if (prepared.monthFull) return atLimit(turn, "month_limit", customerText);
  if (prepared.repliesToday >= prepared.dayCap) return atLimit(turn, "day_cap", customerText);
  const before = beforeTheModel(newLines);
  const context = buildNaturalContext({
    prompt,
    voice: prepared.voice,
    timeZone: prepared.timeZone,
    today: prepared.today,
    now,
    answers: prepared.answers,
    sheets: prepared.sheets,
    lead: prepared.lead,
    facts: prepared.facts,
    lines: prepared.lines,
    cameFrom: prepared.cameFrom,
    notice: before.notice,
    withTools: before.withTools,
  });
  const { io, flagContext } = liveLoopIO(deps, prepared, input, context, now, timing.clock);
  const settings: LoopSettings = {
    startedMs: timing.startedMs,
    organizationId: input.organizationId,
    forced: before.forced,
    flagContext,
  };
  const end = await runNaturalLoop(context, io, settings, trace);
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
      if ("refused" in result) return afterRefusal(turn, { context, io, settings, trace }, end, result, customerText);
      return doneOf(turn, act, result);
    }
  }
}

function traced<T>(tracing: AiTracing | undefined, start: TurnStart, work: () => Promise<T>): Promise<T> {
  return tracing === undefined ? work() : tracing.turn(start, work);
}

/** The gates' outcome (prepare's), or the live turn's; each turn one trace and one log line. */
export async function runNaturalTurn(
  deps: NaturalTurnDependencies,
  input: LiteTurnInput,
  now: Date,
): Promise<LiteOutcome> {
  const clock = () => deps.clock?.().getTime() ?? Date.now();
  const startedMs = clock();
  // The natural follow-up is Task 7's turn: until it lands, a follow-up that came due sends nothing.
  if (input.kind === "nudge") return "nothing";
  const [prompt, prepared] = await Promise.all([naturalPromptOf(deps.prompts), prepareNaturalTurn(deps, input, now)]);
  const leadId = typeof prepared === "string" ? null : prepared.leadId;
  return traced(deps.tracing, naturalTurnStart(input, prompt, leadId), async () => {
    const finish = (done: TurnDone, trace: NaturalTrace | null) => {
      try {
        deps.tracing?.note(naturalTurnNote(done, trace));
      } catch {
        // A note that fails costs the trace its detail, never the turn.
      }
      logNaturalTurn(deps.logger, input, done, trace?.calls.length ?? 0, clock() - startedMs);
      return done.outcome;
    };
    if (typeof prepared === "string") return finish(gateDone(prepared), null);
    const turn: LiveTurn = { deps, input, now, prepared, traceId: randomUUID(), actions: [] };
    const trace = startNaturalTrace(prompt, startedMs);
    const done = await liveTurn(turn, prompt, trace, { startedMs, clock });
    return finish(done, trace.finish(done.outcome, done.fallback, clock()));
  });
}

/** A turn its gates ended before anything was read for the model. */
const gateDone = (outcome: LiteOutcome): TurnDone => ({
  outcome,
  reason: null,
  messages: [],
  actions: [],
  fallback: null,
  leadId: null,
});
