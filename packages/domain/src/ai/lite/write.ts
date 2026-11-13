// The Write step: asks the model for the words of a move (at most twice), fills its blanks, and checks the result before
// anything is sent. A refusal is asked again once with its code; refused twice, nothing goes and the team is told.
import { liteWriteAnswer } from "@travel-crm/contracts/ai";
import type { AiModel } from "@travel-crm/integrations/ai";
import { askFor } from "../grounded/ask.js";
import { checkReply, type ReplyContext } from "../grounded/check.js";
import type { Found } from "../grounded/phrase-match.js";
import { countedCall, type CallEnvironment } from "../grounded/turn-calls.js";
import { repeatsEarlier } from "../repeats.js";
import { fillBlanks } from "./blanks.js";
import { oneLine } from "./context/blocks.js";
import { writeRequest, type WritePromptInput } from "./prompts/write-prompt.js";
import { oneEmoji, styleProblem } from "./style.js";
import type { WriteMove } from "./write-move.js";

export { writeMoveOf, type WriteMove, type WritingAgency } from "./write-move.js";
export { composeReply, fixedPartOf } from "./reply-parts.js";
export { liteReplyContext } from "./reply-context.js";

/**
 * `cannot_answer`: the facts did not answer the customer, so the turn hands over with reason `unanswered`.
 * `refused`: both asks were refused (`code` is the last reason), so the turn hands over with reason `check_failed`.
 * `ended`: the model could not be asked (the limit, or it being down) before any answer was refused.
 */
export type LiteWritten =
  | { kind: "ok"; text: string; filled: Found[]; raw: string[]; refusals: string[] }
  | { kind: "cannot_answer"; raw: string[] }
  | { kind: "refused"; code: string; raw: string[] }
  | { kind: "ended"; outcome: string; raw: string[] };

const ASKS = 2;
const hints: Record<string, string> = {
  amount: "never type a price or any number of rupees; use a blank",
  date: "never type a date; use a blank",
  place: "name only a trip or place from the Facts",
  payment_claim: "never say a payment arrived or a booking is confirmed",
  team_claim: "never speak for the team",
  payment_detail: "never type payment details",
  sentences: "at most 3 sentences",
  questions: "at most one question",
  filler: "no filler opener",
  script: "write in the language and script asked for",
  persona: "never say you are a person or a bot",
  repeat: "say it in new words, do not repeat an earlier message",
  number: "never type a number, seat count or phone number; use a blank",
  empty: "write the message, or set cannot_answer",
  unfit: "answer in the JSON shape asked for",
};

const DIGIT = /[0-9०-९]/gu;
const SEAT_WORDS =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|एक|दो|तीन|चार|पांच|पाँच|ek|do|teen|char|chaar|paanch|panch)";
const SEATS = "(?:seats?|सीट(?:ें)?)";
const LEFT = "(?:left|remaining|available|बची|bachi|bache|bacha)";
const EDGE = "(?<![\\p{L}\\p{M}])";
const SPELLED_SEATS = new RegExp(
  `${EDGE}${SEAT_WORDS}\\s+(?:more\\s+|ही\\s+|hi\\s+)?${SEATS}|${SEATS}\\s+(?:${LEFT})?\\s*:?\\s*${SEAT_WORDS}(?![\\p{L}\\p{M}])`,
  "giu",
);

/** The seat counts in words (English, Hindi or Hinglish) in the text, with their places. */
export function spelledSeatsIn(text: string): Found[] {
  return [...text.matchAll(SPELLED_SEATS)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

const DIGIT_SEATS = new RegExp(`[0-9०-९]+\\s*${SEATS}`, "giu");

/** Every seat count in the text, in digits (ASCII or Devanagari) or in words, with their places: the bench reads the same. */
export function seatCountsIn(text: string): Found[] {
  const digits = [...text.matchAll(DIGIT_SEATS)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  return [...digits, ...spelledSeatsIn(text)];
}

/** Whether this stretch of the text is one code filled (a blank's value), which the reply check never reads as typed. */
const inFilled = (filled: Found[], start: number, end: number) =>
  filled.some((span) => start >= span.start && end <= span.end);

/**
 * The first digit (ASCII or Devanagari) code didn't write, or a seat count in words (English, Hindi or Hinglish) code
 * didn't write: a Write reply types no figure. An agency's own answer filled in may say "three seats".
 */
function typedFigure(text: string, filled: Found[]): string | null {
  for (const match of text.matchAll(DIGIT)) {
    if (!inFilled(filled, match.index, match.index + 1)) {
      return text.slice(Math.max(0, match.index - 20), match.index + 20);
    }
  }
  for (const seats of spelledSeatsIn(text)) {
    if (!inFilled(filled, seats.start, seats.end)) return text.slice(seats.start, seats.end);
  }
  return null;
}

type Verdict = { ok: true; text: string; filled: Found[] } | { ok: false; code: string; correction: string };

/** The blanks filled and every check run, in the order: unknown blank, reply check, style, repeat. */
function judged(
  raw: string,
  move: WriteMove,
  context: ReplyContext,
  language: WritePromptInput["language"],
  sent: readonly string[],
): Verdict {
  const text = oneEmoji(raw);
  const filled = fillBlanks(text, move.blanks.values());
  const refuse = (code: string, near?: string): Verdict => ({
    ok: false,
    code,
    correction: `${code}${near === undefined ? "" : ` near ${oneLine(near)}`}: ${hints[code] ?? "write it again"}`,
  });
  if (text === "") return refuse("empty");
  if (filled.unknown.length > 0) {
    return {
      ok: false,
      code: "unknown_blank",
      correction: `unknown_blank ${oneLine(filled.unknown.join(" "))}: use only the blanks in the Facts`,
    };
  }
  const verdict = checkReply(filled.text, filled.filled, context);
  if (!verdict.ok) return refuse(verdict.reason, verdict.excerpt);
  const typed = typedFigure(filled.text, filled.filled);
  if (typed !== null) return refuse("number", typed);
  const style = styleProblem(text, language);
  if (style !== null) return refuse(style);
  if (repeatsEarlier(filled.text, sent)) return refuse("repeat");
  return { ok: true, text: filled.text, filled: filled.filled };
}

export async function writeMove(
  ai: AiModel,
  environment: CallEnvironment,
  prompt: Omit<WritePromptInput, "correction" | "instruction" | "facts" | "looked">,
  move: WriteMove,
  context: ReplyContext,
  /** The chat's last messages sent. */
  sent: readonly string[],
): Promise<LiteWritten> {
  const raw: string[] = [];
  const refusals: string[] = [];
  let correction: string | null = null;
  for (let attempt = 0; attempt < ASKS; attempt += 1) {
    const { request } = writeRequest({
      ...prompt,
      instruction: move.instruction,
      facts: move.blanks.lines(),
      looked: move.looked,
      correction,
    });
    const asked = await countedCall(environment, async () => {
      const answer = await askFor(ai, request, liteWriteAnswer);
      if (answer.ok) {
        const { model, inputTokens, outputTokens } = answer;
        return { ...answer, usage: { model, inputTokens, outputTokens } };
      }
      return answer;
    });
    if (!asked.ok) {
      if ("raw" in asked) raw.push(asked.raw);
      if (asked.reason === "unfit") {
        refusals.push("unfit");
        correction = `unfit: ${hints.unfit ?? ""}`;
        continue;
      }
      // Having refused one answer, a second that cannot be asked for still leaves the customer waiting.
      const last = refusals.at(-1);
      return last === undefined ? { kind: "ended", outcome: asked.reason, raw } : { kind: "refused", code: last, raw };
    }
    raw.push(asked.raw);
    if (asked.value.cannot_answer) return { kind: "cannot_answer", raw };
    const verdict = judged(asked.value.text.trim(), move, context, prompt.language, sent);
    if (verdict.ok) return { kind: "ok", text: verdict.text, filled: verdict.filled, raw, refusals };
    refusals.push(verdict.code);
    correction = verdict.correction;
  }
  return { kind: "refused", code: refusals.at(-1) ?? "unfit", raw };
}
