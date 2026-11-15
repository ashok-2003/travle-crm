// The agency block (spec 4.1, 4.2): who the agent works for, the owner's answers fenced as owner text, and the trips, in
// full when all fit their budget, else one index line each. It follows the prompt in the system string, so it changes
// only when the agency's data does.
import { agencyQuestionTopics, withoutPaymentDetails, type AgencyAnswers } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { oneLine } from "../../lite/context/blocks.js";
import type { AgentVoice } from "../prompt.js";
import { tripIndexLine, tripInFull } from "../trips/trip-text.js";
import type { TripSheet } from "../types.js";
import { estimateTokens, NATURAL_BUDGETS } from "./tokens.js";

export const AGENCY_HEADING = "# The agency's data";

/** The agency, the agent and the answers; the model never reads a payment detail, even one the owner typed in an answer. */
export function agencyBlock(voice: AgentVoice, timeZone: string, answers: AgencyAnswers): string {
  const agent = voice.agentName.trim() === "" ? "no name set" : oneLine(voice.agentName);
  const answered = agencyQuestionTopics.flatMap((topic) => {
    const answer = answers[topic];
    return answer === undefined || answer.trim() === "" ? [] : [{ topic, answer }];
  });
  const missing = agencyQuestionTopics.filter((topic) => !answered.some((one) => one.topic === topic));
  return [
    AGENCY_HEADING,
    "",
    `Agency: ${oneLine(voice.agencyName)}. Agent: ${agent}. Tone: ${voice.tone}. Time zone: ${timeZone}.`,
    "",
    "## The agency's answers",
    ...answered.map(
      ({ topic, answer }) => `<owner_text topic="${topic}">${fenced(withoutPaymentDetails(answer))}</owner_text>`,
    ),
    ...(missing.length === 0 ? [] : [`Not answered yet: ${missing.join(", ")}.`]),
  ].join("\n");
}

/** Every trip in full when they all fit 8,000 tokens; else one index line each, and the lookups find the rest. */
export function tripsBlock(sheets: readonly TripSheet[], today: CalendarDate): { text: string; indexed: boolean } {
  if (sheets.length === 0) return { text: "## Trips\nNo trip is on sale right now.", indexed: false };
  const inFull = [
    "## Trips",
    "Every trip the agency sells, in full.",
    ...sheets.map((sheet) => `\n${fenced(tripInFull(sheet, today))}`),
  ].join("\n");
  if (estimateTokens(inFull) <= NATURAL_BUDGETS.trips) return { text: inFull, indexed: false };
  const lines = sheets.map((sheet) => fenced(tripIndexLine(sheet, today)));
  return {
    text: ["## Trips", "One line per trip; find_trips and get_trip give a trip in full.", ...lines].join("\n"),
    indexed: true,
  };
}
