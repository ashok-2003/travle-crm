// How a natural turn ends (spec 3.2 and 3.6): the reply, in at most two messages, with what was staged and its trace
// flags; or the fallback: nothing to the customer (the owner, 2026-11-24), only the agency's own actions kept, and a task
// for the team holding what the customer wrote, what wasn't done and the AI's draft.
import type { BookingTerms } from "@travel-crm/contracts/ai";
import { formatRupees, formatShortDay, parseCalendarDate, type CalendarDate } from "../../../kernel/index.js";
import type { NaturalContext } from "../context/build.js";
import { traceFlags } from "../guards/check-words.js";
import { withStaged } from "../tools/action-tools.js";
import type { NaturalTraceBuilder } from "../trace.js";
import type { StagedAction, StagedSet } from "../types.js";
import type { FallbackReason, LoopEnd, LoopSettings, TurnRun } from "./types.js";
import { fallbackTask, splitMessages } from "./words.js";

export interface TurnEnds {
  final(run: TurnRun, words: string, callsUsed: number, model: string): LoopEnd;
  /** `handOver` is staged with the fallback (G4's second failure). */
  fallback(reason: FallbackReason, run: TurnRun, draft: string | null, handOver?: StagedAction): LoopEnd;
}

/**
 * What reaches the customer, never in a fallback (the lead's ruling, 2026-11-16): no seats held, no payment lines or QR,
 * no brochure, no offer they didn't read, and no stay_quiet, since the team's task stands for the reply. The agency's own
 * actions stay: a task, a hand-over, the lead's fields, a note, a follow-up, a suggested close.
 */
export const CUSTOMER_FACING = ["book", "resend_payment", "send_brochure", "offer_booking", "stay_quiet"] as const;

export function without(set: StagedSet, tools: readonly StagedAction["tool"][]): StagedSet {
  return new Map([...set].filter(([tool]) => !tools.includes(tool)));
}

/** A dropped action in the team's words, so they can do it themselves; null when there is nothing to do. */
export function notDone(
  action: StagedAction,
  tripOf: (packageId: string) => string,
  today: CalendarDate,
): string | null {
  const trip = (terms: Omit<BookingTerms, "payInFull">) =>
    `${tripOf(terms.packageId)} for ${String(terms.adults + terms.childrenAges.length)} on ` +
    formatShortDay(parseCalendarDate(terms.startsOn), today);
  switch (action.tool) {
    case "book":
      return `the customer may have wanted to book ${trip(action.terms)}`;
    case "offer_booking":
      return `the AI meant to offer ${trip(action.offer)}, total ${formatRupees(action.offer.totalPaise)}`;
    case "send_brochure":
      return `the AI meant to send ${tripOf(action.packageId)}'s brochure`;
    case "resend_payment":
      return "the AI meant to send the payment details again";
    default:
      return null;
  }
}

export function turnEnds(context: NaturalContext, settings: LoopSettings, trace: NaturalTraceBuilder): TurnEnds {
  const customerText = context.newLines.map((line) => line.text).join("\n");
  const labelOf = new Map([...context.labels].map(([label, packageId]) => [packageId, label]));
  const tripOf = (packageId: string) => labelOf.get(packageId) ?? "a trip";
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
      const kept = without(run.staged, CUSTOMER_FACING);
      const staged = handOver === undefined ? kept : withStaged(kept, handOver);
      trace.staged(staged);
      const dropped = [...run.staged.values()].flatMap((action) => {
        const words = staged.has(action.tool) ? null : notDone(action, tripOf, settings.flagContext.today);
        return words === null ? [] : [words];
      });
      return {
        end: "fallback",
        reason,
        staged,
        task: fallbackTask({ reason, customerText, dropped, draft }),
        draft,
      };
    },
  };
}
