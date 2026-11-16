// The natural agent's loop (spec 3.2): the model reads the context, calls tools and reads their results, and writes the
// reply; the guards check the words, a failure gets one retry, then that guard's fallback. The caps bound it
// (NATURAL_LIMITS), a newer customer line ends it, and a bad request, a cut-off answer or a pinned model that didn't
// answer starts it over once (ruling 12). Its parts: loop/request.ts, loop/tool-calls.ts, loop/reply.ts, loop/ends.ts.
import type { AiResult } from "@travel-crm/integrations/ai";
import type { NaturalContext } from "./context/build.js";
import { turnEnds } from "./loop/ends.js";
import { afterResponse } from "./loop/reply.js";
import { answerMessage, freshRun, requestOf, restartFor } from "./loop/request.js";
import { runToolCalls } from "./loop/tool-calls.js";
import { NATURAL_LIMITS, type LoopEnd, type LoopIO, type LoopSettings } from "./loop/types.js";
import { replyWords } from "./loop/words.js";
import { answeredCall, failedCall, type NaturalTraceBuilder } from "./trace.js";

export { NATURAL_LIMITS, type LoopEnd, type LoopIO, type LoopSettings } from "./loop/types.js";
export { splitMessages } from "./loop/words.js";

interface Limit {
  ok: false;
  reason: "limit";
}
const isLimit = (result: AiResult | Limit): result is Limit => !result.ok && result.reason === "limit";

export async function runNaturalLoop(
  context: NaturalContext,
  io: LoopIO,
  settings: LoopSettings,
  trace: NaturalTraceBuilder,
): Promise<LoopEnd> {
  const deadline = settings.startedMs + NATURAL_LIMITS.turnMs;
  const left = () => deadline - io.clock();
  const ends = turnEnds(context, settings, trace);
  let calls = settings.callsUsed ?? 0;
  let restarted = false;
  let run = freshRun(context, settings.forced, settings.model, "low");
  trace.staged(run.staged);
  while (calls < NATURAL_LIMITS.calls && left() >= NATURAL_LIMITS.lastCallMs) {
    if (await io.newerLine()) return { end: "superseded" };
    const request = requestOf(context, run, settings, deadline, left());
    const started = io.clock();
    const result = await io.call(request);
    calls += 1;
    if (isLimit(result)) return { end: "model_failed", reason: "limit" };
    const ms = io.clock() - started;
    trace.call(result.ok ? answeredCall(result, ms) : failedCall(request, result.reason, ms));
    const restart = restartFor(result, run, settings.model);
    if (restart !== null) {
      if (restarted || left() < NATURAL_LIMITS.nextModelMs) {
        // A cut-off answer that can't start over is no answer.
        return { end: "model_failed", reason: result.ok ? "unavailable" : result.reason };
      }
      restarted = true;
      trace.restart(restart.reason);
      run = freshRun(context, settings.forced, restart.model, restart.effort);
      trace.staged(run.staged);
      continue;
    }
    if (!result.ok) return { end: "model_failed", reason: result.reason };
    const model = run.model ?? result.model;
    run.model = model;
    run.messages.push(answerMessage(result));
    const words = replyWords(result.text);
    const done = await runToolCalls(result.toolCalls ?? [], words, { context, io, trace }, run);
    const end = afterResponse({ words, done, callsUsed: calls, model }, run, { io, ends, trace });
    if (end !== null) return end;
  }
  return ends.fallback(calls >= NATURAL_LIMITS.calls ? "cap" : "deadline", run, run.draft);
}
