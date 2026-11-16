// What follows a response (spec 3.2; rulings 4, 11 and 14; pre-flight #14): one that read or had a call refused goes on;
// one with no words gets one more call unless it may end in silence; otherwise the guards check its words. A pass is the
// reply, a first failure goes back to the model as an app check after its draft, and a second applies that guard's
// fallback.
import type { WordsVerdict } from "../guards/check-words.js";
import type { NaturalTraceBuilder } from "../trace.js";
import { without, type TurnEnds } from "./ends.js";
import type { CallsDone } from "./tool-calls.js";
import type { LoopEnd, LoopIO, TurnRun } from "./types.js";
import { appCheck, HAND_OVER_WORDS, NO_WORDS } from "./words.js";

/** The model's actions that end a turn without words: a brochure goes, or nothing should (spec 3.2). */
const QUIET_ENDERS = ["send_brochure", "stay_quiet"] as const;
/** Payment lines and a QR never go without the model's sentence beside them. */
const NEEDS_WORDS = ["book", "resend_payment"] as const;
const DISCOUNT_SUMMARY = "Discount or team promise: the AI's reply twice named one nobody gave. A person decides.";

export interface Response {
  words: string;
  done: CallsDone;
  callsUsed: number;
  model: string;
}

/** The turn's end, or null when the loop calls the model again. */
export function afterResponse(
  response: Response,
  run: TurnRun,
  turn: { io: LoopIO; ends: TurnEnds; trace: NaturalTraceBuilder },
): LoopEnd | null {
  const { words, done } = response;
  // Words beside a read came before its facts; a refusal is for the model to act on.
  if (done.read || done.refused) return null;
  if (words === "" && !mayEndSilent(run)) {
    if (run.nudged) return turn.ends.fallback("model", run, run.draft);
    run.nudged = true;
    run.messages.push(appCheck(run.modelStaged.has("hand_over") ? HAND_OVER_WORDS : NO_WORDS));
    return null;
  }
  const verdict = turn.io.check(words, run.staged, run.quoted);
  turn.trace.guards(verdict.verdicts);
  if (verdict.ok) return turn.ends.final(run, words, response.callsUsed, response.model);
  run.draft = words;
  if (!run.retried) {
    run.retried = true;
    run.messages.push(appCheck(`Not sent: ${verdict.retry}`));
    return null;
  }
  return guardFallback(verdict, response, run, turn);
}

/**
 * Whether a response with no words may end the turn (the lead's ruling, 2026-11-16): a hand-over owes the customer a line
 * (spec 3.5), unless it is for abuse, where silence is right; a hold or a resend needs a sentence; otherwise a brochure
 * or stay_quiet the model staged ends it. Code's own actions never do (pre-flight #14).
 */
function mayEndSilent(run: TurnRun): boolean {
  const handOver = run.staged.get("hand_over");
  if (handOver?.tool === "hand_over" && handOver.reason !== "abuse") return false;
  if (NEEDS_WORDS.some((tool) => run.staged.has(tool))) return false;
  return QUIET_ENDERS.some((tool) => run.modelStaged.has(tool)) || run.modelStaged.has("hand_over");
}

/** A guard's second failure (spec 5): the offer withdrawn and the words sent, or the fallback line (and a hand-over). */
function guardFallback(
  verdict: Extract<WordsVerdict, { ok: false }>,
  response: Response,
  run: TurnRun,
  { ends, trace }: { ends: TurnEnds; trace: NaturalTraceBuilder },
): LoopEnd {
  const reason = `guard:${verdict.guard}` as const;
  switch (verdict.fallback) {
    case "withdraw_offer":
      run.staged = without(run.staged, ["offer_booking"]);
      trace.flag("offer_withdrawn");
      return ends.final(run, response.words, response.callsUsed, response.model);
    case "hand_over_discount": {
      // One hand-over a turn: an earlier one's reason goes in this one's summary.
      const earlier = run.staged.get("hand_over");
      const also = earlier?.tool === "hand_over" ? ` Also ${earlier.reason}: ${earlier.summary}` : "";
      return ends.fallback(reason, run, response.words, {
        tool: "hand_over",
        reason: "discount",
        summary: `${DISCOUNT_SUMMARY}${also}`,
      });
    }
    case "fallback_task":
      return ends.fallback(reason, run, response.words);
  }
}
