// The agency block (spec 4.1, 4.2): who the agent works for, the owner's answers each under its own heading, and the
// trips, each one's sheet when all fit their budget, else a short labelled entry each. It follows the prompt in the system
// string, so it changes only when the agency's data does.
import {
  agencyQuestionTopics,
  withoutPaymentDetails,
  type AgencyAnswers,
  type AgencyQuestionTopic,
} from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import type { AgencyContact } from "../../agency-answers.js";
import { fenced } from "../../fenced.js";
import { oneLine } from "../../lite/context/blocks.js";
import type { AgentVoice } from "../prompt.js";
import { isText, tripIndexEntry, tripInFull } from "../trips/trip-text.js";
import type { TripSheet } from "../types.js";
import { estimateTokens, NATURAL_BUDGETS } from "./tokens.js";

export const AGENCY_HEADING = "# The agency's data";
/** Trip IDs went into customer messages ("4N wala trip (T7)"): they are the tools' handles, never the customer's. */
export const TRIP_ID_RULE = "Each trip's ID (T1, T2…) is for tools only: never write it to the customer.";

const topicHeadings: Record<AgencyQuestionTopic, string> = {
  cancellation: "Cancellation",
  refunds: "Refunds",
  id_documents: "ID documents",
  safety: "Safety",
  children: "Children",
  payment_methods: "Payment methods",
};

/** The owner's words as data: no tag of theirs can open, and no line of theirs can start a heading of its own. */
const ownerWords = (text: string) => fenced(text.trim()).replace(/^[ \t]*#+[ \t]*/gmu, "");

/**
 * The agency, the agent and the answers; the model never reads a payment detail, even one the owner typed in an answer.
 * The tone is left out (the owner, 2026-11-24): the prompt sets how the agent writes.
 */
export function agencyBlock(
  voice: AgentVoice,
  timeZone: string,
  answers: AgencyAnswers,
  contact: AgencyContact,
): string {
  const agent = voice.agentName.trim() === "" ? "no name set" : oneLine(voice.agentName);
  const answered = agencyQuestionTopics.flatMap((topic) => {
    const answer = answers[topic];
    return answer === undefined || answer.trim() === "" ? [] : [{ topic, answer }];
  });
  const missing = agencyQuestionTopics.filter((topic) => !answered.some((one) => one.topic === topic));
  return [
    AGENCY_HEADING,
    "",
    `Agency: ${oneLine(voice.agencyName)}. Agent: ${agent}. Time zone: ${timeZone}.`,
    ...[
      contact.office === "" ? null : `Office: ${oneLine(contact.office)}`,
      contact.instagramUrl === "" ? null : `Instagram: ${oneLine(contact.instagramUrl)}`,
      contact.about === "" ? null : `About the agency: ${oneLine(contact.about)}`,
    ].filter(isText),
    "",
    "## The agency's answers",
    ...answered.flatMap(({ topic, answer }) => [
      "",
      `### ${topicHeadings[topic]}`,
      ownerWords(withoutPaymentDetails(answer)),
    ]),
    ...(missing.length === 0
      ? []
      : ["", `Not answered yet: ${missing.map((topic) => topicHeadings[topic]).join(", ")}.`]),
  ].join("\n");
}

/**
 * Every trip's sheet when they all fit 8,000 tokens, else a short entry each. A sheet is cut to its budget, so either
 * way the lookups read the rest.
 */
export function tripsBlock(sheets: readonly TripSheet[], today: CalendarDate): { text: string; indexed: boolean } {
  if (sheets.length === 0) return { text: "## Trips\nNo trip is on sale right now.", indexed: false };
  const inFull = [
    "## Trips",
    `Every trip the agency sells, summarised; get_trip reads one in full. ${TRIP_ID_RULE}`,
    ...sheets.map((sheet) => `\n${fenced(tripInFull(sheet, today))}`),
  ].join("\n");
  if (estimateTokens(inFull) <= NATURAL_BUDGETS.trips) return { text: inFull, indexed: false };
  const entries = sheets.map((sheet) => `\n${fenced(tripIndexEntry(sheet, today))}`);
  return {
    text: [
      "## Trips",
      `A short entry per trip; find_trips and get_trip give a trip in full. ${TRIP_ID_RULE}`,
      ...entries,
    ].join("\n"),
    indexed: true,
  };
}
