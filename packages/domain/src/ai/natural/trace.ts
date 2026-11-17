// A natural turn's trace as the loop builds it (contracts' naturalTrace), for "Why": each model call with its tool calls,
// the guards' verdicts, one summary per staged action, the flags and a restart. Read later, so a day carries its year.
import type { BookingTerms, NaturalTrace } from "@travel-crm/contracts/ai";
import type { AiFailure, AiRequest, AiResult } from "@travel-crm/integrations/ai";
import { formatRupees, formatShortDay, parseCalendarDate } from "../../kernel/index.js";
import type { NaturalPrompt } from "./prompt.js";
import type { StagedAction, StagedSet } from "./types.js";

type TraceCall = NaturalTrace["calls"][number];

export interface NaturalTraceBuilder {
  /** Opens a call: the tool calls recorded next are its. */
  call(entry: Omit<TraceCall, "tools">): void;
  tool(entry: TraceCall["tools"][number]): void;
  /** Adds verdicts: a retried reply's come after the refused draft's. */
  guards(verdicts: NaturalTrace["guards"]): void;
  /** What is staged now, replacing what was: one summary per action. */
  staged(set: StagedSet): void;
  flag(code: string): void;
  restart(reason: "bad_request" | "length" | "model"): void;
  finish(outcome: string, fallback: string | null, endedMs: number): NaturalTrace;
}

/** The prompt as the trace names it: its version, and the Langfuse label it was read at (none for the built-in text). */
export function startNaturalTrace(
  prompt: Pick<NaturalPrompt, "version" | "source">,
  startedMs: number,
): NaturalTraceBuilder {
  const promptVersion = prompt.version;
  const promptLabel = prompt.source?.label ?? null;
  const calls: TraceCall[] = [];
  const guards: NaturalTrace["guards"] = [];
  let staged: NaturalTrace["staged"] = [];
  const flags: string[] = [];
  let restarted: string | null = null;
  return {
    call: (entry) => {
      calls.push({ ...entry, tools: [] });
    },
    tool: (entry) => {
      calls.at(-1)?.tools.push(entry);
    },
    guards: (verdicts) => {
      guards.push(...verdicts);
    },
    staged: (set) => {
      staged = [...set.values()].map((action) => ({ tool: action.tool, summary: summaryOf(action) }));
    },
    flag: (code) => {
      if (!flags.includes(code)) flags.push(code);
    },
    restart: (reason) => {
      restarted = reason;
    },
    finish: (outcome, fallback, endedMs) => ({
      agent: "natural",
      promptVersion,
      promptLabel,
      outcome,
      fallback,
      restarted,
      durationMs: endedMs - startedMs,
      calls,
      guards,
      staged,
      flags,
    }),
  };
}

/** A call that answered: tokens a provider didn't count are 0 (they are optional on the port, ruling 15). */
export function answeredCall(result: Extract<AiResult, { ok: true }>, ms: number): Omit<TraceCall, "tools"> {
  return {
    model: result.model,
    ms,
    inputTokens: result.inputTokens,
    cachedTokens: result.cachedTokens ?? 0,
    outputTokens: result.outputTokens,
    reasoningTokens: result.reasoningTokens ?? 0,
    finishReason: result.finishReason ?? "stop",
    words: result.text.trim() === "" ? null : result.text,
  };
}

/** A call no model answered, under the model it named (none when it named none). */
export function failedCall(request: AiRequest, reason: AiFailure, ms: number): Omit<TraceCall, "tools"> {
  const none = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  return { model: request.model ?? "", ms, ...none, finishReason: `failed:${reason}`, words: null };
}

/** "Sat 19 Dec 2026". */
const dayWords = (day: string) => {
  const date = parseCalendarDate(day);
  return `${formatShortDay(date, date)} ${day.slice(0, 4)}`;
};

function termsWords(terms: Omit<BookingTerms, "payInFull">): string {
  const adults = `${String(terms.adults)} ${terms.adults === 1 ? "adult" : "adults"}`;
  const children = terms.childrenAges.length === 0 ? "" : `, children aged ${terms.childrenAges.join(", ")}`;
  return `${dayWords(terms.startsOn)}, ${adults}${children}, ${terms.room ?? "any room"}`;
}

function summaryOf(action: StagedAction): string {
  switch (action.tool) {
    case "update_lead": {
      const fields = Object.entries(action.fields).map(
        ([field, value]) => `${field} ${Array.isArray(value) ? value.join(", ") : String(value)}`,
      );
      return [...fields, ...action.notes].join("; ");
    }
    case "send_brochure":
      return `${action.packageId}: ${String(action.fileIds.length)} ${action.fileIds.length === 1 ? "file" : "files"}`;
    case "offer_booking": {
      const { offer } = action;
      const due = offer.payInFull ? "paid in full" : `advance ${formatRupees(offer.advancePaise)}`;
      return `${termsWords(offer)}; total ${formatRupees(offer.totalPaise)}, ${due}`;
    }
    case "book":
      return (
        `${termsWords(action.terms)}; total ${formatRupees(action.figures.totalPaise)}; ${action.fullName}, ` +
        `"${action.customerWords}" (${action.via === "offer" ? "the live offer" : "a total told"})`
      );
    case "resend_payment":
      return "the payment message again";
    case "plan_follow_up":
      return `${action.at === null ? "none" : action.at.toISOString()}: ${action.about}`;
    case "create_task":
      return `${action.kind}: ${action.text}`;
    case "add_note":
      return action.text;
    case "hand_over":
      return `${action.reason}: ${action.summary}`;
    case "suggest_close":
      return `${action.kind}: ${action.reason}`;
    case "stay_quiet":
      return action.reason;
  }
}
