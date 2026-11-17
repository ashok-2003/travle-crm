// How a one turn ends, as natural's does (spec 3.2 and 3.6) but with no word checks (R5): the reply in at most two
// messages with what was staged; or the fallback line with only the agency's own actions kept, and a task for the team
// holding what the customer wrote and what wasn't done.
import type { AiMessage } from "@travel-crm/integrations/ai";
import type { CalendarDate } from "../../kernel/index.js";
import { fallbackLine } from "../natural/fallback-line.js";
import { CUSTOMER_FACING, notDone, without } from "../natural/loop/ends.js";
import type { FallbackReason, LoopEnd } from "../natural/loop/types.js";
import { fallbackTask, splitMessages } from "../natural/loop/words.js";
import type { NaturalTraceBuilder } from "../natural/trace.js";
import type { OneContext } from "./context.js";
import type { OneRun } from "./tools.js";

/** The reply. Words beside stay_quiet go out and drop it (ruling 11): silence is the costlier mistake. */
export function oneFinal(
  run: OneRun,
  words: string,
  answer: { transcript: AiMessage[]; callsUsed: number; model: string },
  trace: NaturalTraceBuilder,
): LoopEnd {
  let { staged } = run;
  if (words !== "" && staged.has("stay_quiet")) {
    staged = without(staged, ["stay_quiet"]);
    trace.flag("quiet_with_words");
  }
  trace.staged(staged);
  return { end: "final", messages: splitMessages(words), staged, quoted: run.quoted, ...answer };
}

/** The fallback line in the customer's language; nothing that reaches them goes beside it, and the task names it. */
export function oneFallback(
  reason: FallbackReason,
  run: OneRun,
  turn: { context: OneContext; today: CalendarDate; trace: NaturalTraceBuilder },
): LoopEnd {
  const staged = without(run.staged, CUSTOMER_FACING);
  turn.trace.staged(staged);
  const labelOf = new Map([...turn.context.labels].map(([label, packageId]) => [packageId, label]));
  const tripOf = (packageId: string) => labelOf.get(packageId) ?? "a trip";
  const dropped = [...run.staged.values()]
    .filter((action) => !staged.has(action.tool))
    .flatMap((action) => notDone(action, tripOf, turn.today) ?? []);
  const customerText = turn.context.newLines.map((line) => line.text).join("\n");
  const line = fallbackLine(customerText);
  const task = fallbackTask({ reason, line, customerText, dropped, draft: null });
  return { end: "fallback", reason, messages: [line], staged, task, draft: null };
}
