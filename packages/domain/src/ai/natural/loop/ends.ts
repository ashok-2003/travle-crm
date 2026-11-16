// How a natural turn ends (spec 3.2 and 3.6): the reply, in at most two messages, with what was staged and its trace
// flags; or the fallback line, with a task for the team holding what the customer wrote and the AI's draft.
import type { NaturalContext } from "../context/build.js";
import { fallbackLine } from "../fallback-line.js";
import { traceFlags } from "../guards/check-words.js";
import { withStaged } from "../tools/action-tools.js";
import type { NaturalTraceBuilder } from "../trace.js";
import type { StagedAction, StagedSet } from "../types.js";
import type { FallbackReason, LoopEnd, LoopSettings, TurnRun } from "./types.js";
import { fallbackTask, splitMessages } from "./words.js";

export interface TurnEnds {
  final(run: TurnRun, words: string, callsUsed: number, model: string): LoopEnd;
  /** `handOver` is staged with the fallback line (G4's second failure). */
  fallback(reason: FallbackReason, run: TurnRun, draft: string | null, handOver?: StagedAction): LoopEnd;
}

export function without(set: StagedSet, tools: readonly StagedAction["tool"][]): StagedSet {
  return new Map([...set].filter(([tool]) => !tools.includes(tool)));
}

export function turnEnds(context: NaturalContext, settings: LoopSettings, trace: NaturalTraceBuilder): TurnEnds {
  const customerText = context.newLines.map((line) => line.text).join("\n");
  return {
    final(run, words, callsUsed, model) {
      let { staged } = run;
      // Words beside stay_quiet go out, and stay_quiet is dropped (ruling 11): silence is the costlier mistake.
      if (words !== "" && staged.has("stay_quiet")) {
        staged = without(staged, ["stay_quiet"]);
        trace.flag("quiet_with_words");
      }
      for (const flag of traceFlags(words, settings.flagContext)) trace.flag(flag);
      trace.staged(staged);
      const { quoted, messages: transcript } = run;
      return { end: "final", messages: splitMessages(words), staged, quoted, transcript, callsUsed, model };
    },
    fallback(reason, run, draft, handOver) {
      // The customer reads only the fallback line: an offer they never read isn't made (G2), and silence isn't kept.
      const kept = without(run.staged, ["offer_booking", "stay_quiet"]);
      const staged = handOver === undefined ? kept : withStaged(kept, handOver);
      trace.staged(staged);
      const line = fallbackLine(customerText);
      return {
        end: "fallback",
        reason,
        messages: [line],
        staged,
        task: fallbackTask(reason, line, customerText, draft),
        draft,
      };
    },
  };
}
