// The context the natural agent's model reads each turn (spec 4.1): one system string (the prompt, then the agency
// block and the trips, byte for byte the same while the data is, so the provider caches it), the chat as real turns,
// and the turn block last; with the tools the turn offers, the trip labels, and each block's size against its budget.
import { naturalToolDefinitions, type AgencyAnswers, type NaturalFacts } from "@travel-crm/contracts/ai";
import type { AiMessage, AiTool } from "@travel-crm/integrations/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import { renderNaturalPrompt, type AgentVoice, type NaturalPrompt } from "../prompt.js";
import type { NaturalChatLine, NaturalLeadView, TripSheet } from "../types.js";
import { agencyBlock, tripsBlock } from "./agency-block.js";
import { chatTurns, newLinesOf } from "./chat-turns.js";
import { estimateTokens, type NATURAL_BUDGETS } from "./tokens.js";
import { turnBlock } from "./turn-block.js";

export interface NaturalContextInput {
  prompt: NaturalPrompt;
  voice: AgentVoice;
  timeZone: string;
  today: CalendarDate;
  now: Date;
  answers: AgencyAnswers;
  sheets: readonly TripSheet[];
  lead: NaturalLeadView;
  facts: NaturalFacts;
  /** The whole chat read, oldest first. */
  lines: readonly NaturalChatLine[];
  cameFrom: { source: string; packageId: string | null } | null;
  /** What the app did before the model (ruling 6), else null. */
  notice: string | null;
  /** False for ruling 6's turns: one call with no tools. */
  withTools: boolean;
}

export interface NaturalContext {
  messages: AiMessage[];
  tools: AiTool[];
  /** Label to package id. */
  labels: ReadonlyMap<string, string>;
  indexed: boolean;
  newLines: NaturalChatLine[];
  /** The chat lines the model reads: those the chat's window shows, then the new lines. The guards read these. */
  shown: NaturalChatLine[];
  sizes: Record<keyof typeof NATURAL_BUDGETS, number>;
}

export function buildNaturalContext(input: NaturalContextInput): NaturalContext {
  const prompt = renderNaturalPrompt(input.prompt, input.voice).trimEnd();
  const agency = agencyBlock(input.voice, input.timeZone, input.answers);
  const trips = tripsBlock(input.sheets, input.today);
  const lastTurnAt = input.facts.lastTurnAt === null ? null : new Date(input.facts.lastTurnAt);
  const newLines = newLinesOf(input.lines, lastTurnAt);
  const clock = { now: input.now, today: input.today, timeZone: input.timeZone };
  const chat = chatTurns(
    input.lines.filter((line) => !newLines.includes(line)),
    clock,
  );
  const turn = turnBlock({
    ...clock,
    lead: input.lead,
    facts: input.facts,
    cameFrom: input.cameFrom,
    notice: input.notice,
    newLines,
    sheets: input.sheets,
    indexed: trips.indexed,
  });
  const labels = new Map(input.sheets.map((sheet) => [sheet.label, sheet.packageId]));
  return {
    messages: [
      { role: "system", content: [prompt, agency, trips.text].join("\n\n") },
      ...chat.messages,
      { role: "user", content: turn },
    ],
    tools: input.withTools ? naturalToolDefinitions({ tripLabels: [...labels.keys()] }) : [],
    labels,
    indexed: trips.indexed,
    newLines,
    shown: [...chat.shown, ...newLines],
    sizes: {
      prompt: estimateTokens(prompt),
      agency: estimateTokens(agency),
      trips: estimateTokens(trips.text),
      chat: estimateTokens(chat.messages.map((message) => message.content).join("\n")),
      turn: estimateTokens(turn),
    },
  };
}
