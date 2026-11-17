// The natural agent's words for the team when it hands a chat over (spec 3.5, plan 2 ruling 5), in English as lite's
// act-words.ts: one sentence per reason the model may give and per code's own (the day's cap, the month's limit). The
// inbox bar and the owner's notice read "<the sentence>: <the model's summary>".
import type { OneHandOverReason } from "@travel-crm/contracts/ai";
import { cutText } from "./context/tokens.js";

/** Code's own reasons at a limit, which the model's enum leaves out: no model call was made. */
export type CodeHandOverReason = "day_cap" | "month_limit";
export const codeHandOverReasons: ReadonlySet<string> = new Set<CodeHandOverReason>(["day_cap", "month_limit"]);

/** The longest reason the chat keeps (lite's limit for `handoff_reason`). */
export const HAND_OVER_REASON_MAX = 300;

/** Why the AI stepped back, as the team reads it. */
export const handOverSentences: Record<OneHandOverReason | CodeHandOverReason, string> = {
  discount: "Asked for a discount or a better price",
  custom_trip: "Wants a custom or private trip",
  complaint: "Is unhappy or has a complaint",
  payment_check: "Sent a payment screenshot for you to check",
  wants_person: "Asked to talk to a person",
  abuse: "Wrote abusively",
  big_group: "A group of more than 10 people",
  existing_booking: "Wants to change, cancel or ask about a booking they have",
  b2b: "Asks about a business booking or agent rates",
  day_cap: "Wrote more than the AI answers in a day",
  month_limit: "This month's AI replies are used up",
};

const isKnown = (reason: string): reason is keyof typeof handOverSentences => Object.hasOwn(handOverSentences, reason);

/** "<the reason's sentence>: <the summary>", cut to the chat's limit; the sentence alone when there is no summary. */
export function handOverText(handOver: { reason: string; summary: string }): string {
  const sentence = isKnown(handOver.reason) ? handOverSentences[handOver.reason] : "The AI handed the chat over";
  const summary = handOver.summary.trim();
  return cutText(summary === "" ? sentence : `${sentence}: ${summary}`, HAND_OVER_REASON_MAX);
}
