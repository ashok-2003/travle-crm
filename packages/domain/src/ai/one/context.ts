// What the one agent's model reads each turn: the cached system string, the chat whole, and the turn block last, with
// the tools the turn offers. The same pieces as natural's context, minus its window, budgets and token sizes.
import { oneToolSchemas, type OneToolSchema } from "@travel-crm/contracts/ai";
import type { AiMessage } from "@travel-crm/integrations/ai";
import { agencyBlock, tripsBlock } from "../natural/context/agency-block.js";
import { newLinesOf } from "../natural/context/chat-turns.js";
import type { NaturalContextInput } from "../natural/context/build.js";
import { turnBlock } from "../natural/context/turn-block.js";
import { renderNaturalPrompt } from "../natural/prompt.js";
import { brochureLabelsOf, brochuresBlock, sentBrochuresLine } from "../natural/trips/brochures.js";
import type { NaturalChatLine } from "../natural/types.js";
import { oneHistory } from "./history.js";

export interface OneContextInput extends Omit<NaturalContextInput, "withTools"> {
  tools: "all" | "none" | "stay_quiet";
  /** Spec 9's summary; always null until the summary PR. */
  summary: string | null;
}

export interface OneContext {
  /** System, history, turn block. */
  messages: AiMessage[];
  /** Label to package id. */
  labels: ReadonlyMap<string, string>;
  newLines: NaturalChatLine[];
  /** What the turn offers. */
  tools: OneToolSchema[];
}

export function buildOneContext(input: OneContextInput): OneContext {
  // Byte for byte as natural builds it: the provider caches this string.
  const prompt = renderNaturalPrompt(input.prompt, input.voice).trimEnd();
  const agency = agencyBlock(input.voice, input.timeZone, input.answers);
  const trips = tripsBlock(input.sheets, input.today);
  const lastTurnAt = input.facts.lastTurnAt === null ? null : new Date(input.facts.lastTurnAt);
  const newLines = newLinesOf(input.lines, lastTurnAt);
  const clock = { now: input.now, today: input.today, timeZone: input.timeZone };
  const history = oneHistory(
    input.lines.filter((line) => !newLines.includes(line)),
    clock,
    input.summary,
  );
  const turn = turnBlock({
    ...clock,
    lead: input.lead,
    facts: input.facts,
    cameFrom: input.cameFrom,
    // What was sent comes before the notice, so the model sees both before the new messages.
    notice:
      [sentBrochuresLine(input.sheets, input.facts.sentFileIds), input.notice]
        .filter((line) => line !== null)
        .join("\n") || null,
    newLines,
    sheets: input.sheets,
    indexed: trips.indexed,
  });
  const labels = new Map(input.sheets.map((sheet) => [sheet.label, sheet.packageId]));
  const all = oneToolSchemas({
    tripLabels: [...labels.keys()],
    brochureLabels: [...brochureLabelsOf(input.sheets).keys()],
  });
  return {
    messages: [
      {
        role: "system",
        content: [prompt, agency, trips.text, brochuresBlock(input.sheets)]
          .filter((part) => part !== null)
          .join("\n\n"),
      },
      ...history,
      { role: "user", content: turn },
    ],
    labels,
    newLines,
    tools: input.tools === "all" ? all : input.tools === "none" ? [] : all.filter((tool) => tool.name === "stay_quiet"),
  };
}
