// What the one agent's model reads each turn: the cached system string, the customer's notes and the chat whole, and the
// customer's new words last, with the tools the turn offers.
import { oneToolSchemas, type OneToolSchema } from "@travel-crm/contracts/ai";
import type { AiMessage } from "@travel-crm/integrations/ai";
import { agencyBlock, tripsBlock } from "../natural/context/agency-block.js";
import { newLinesOf } from "../natural/context/chat-turns.js";
import type { NaturalContextInput } from "../natural/context/build.js";
import { renderNaturalPrompt } from "../natural/prompt.js";
import { brochureLabelsOf, brochuresBlock } from "../natural/trips/brochures.js";
import type { NaturalChatLine } from "../natural/types.js";
import { customerBlock, openingNotes } from "./customer-block.js";
import { oneHistory } from "./history.js";
import { turnMessage } from "./turn-message.js";

export interface OneContextInput extends Omit<NaturalContextInput, "withTools"> {
  tools: "all" | "none" | "stay_quiet";
  /** Spec 9's summary; always null until the summary PR. */
  summary: string | null;
}

export interface OneContext {
  /** System, the opening notes and the chat, the turn's message. */
  messages: AiMessage[];
  /** Label to package id. */
  labels: ReadonlyMap<string, string>;
  newLines: NaturalChatLine[];
  /** What the turn offers. */
  tools: OneToolSchema[];
  /** The customer's voice notes and photos by the reference the chat shows (m1, m2...), for the media tools. */
  media: ReadonlyMap<string, { messageId: string; kind: "audio" | "image" }>;
}

/** The customer's voice notes and photos named m1, m2... oldest first; the model passes these to the media tools. */
function withReferences(lines: readonly NaturalChatLine[]) {
  const media = new Map<string, { messageId: string; kind: "audio" | "image" }>();
  const named = lines.map((line) => {
    if (line.from !== "customer" || (line.kind !== "audio" && line.kind !== "image")) return line;
    const ref = `m${String(media.size + 1)}`;
    media.set(ref, { messageId: line.id, kind: line.kind });
    return { ...line, ref };
  });
  return { named, media };
}

export function buildOneContext(input: OneContextInput): OneContext {
  // Byte for byte as natural builds it: the provider caches this string.
  const prompt = renderNaturalPrompt(input.prompt, input.voice).trimEnd();
  const agency = agencyBlock(input.voice, input.timeZone, input.answers);
  const trips = tripsBlock(input.sheets, input.today);
  const lastTurnAt = input.facts.lastTurnAt === null ? null : new Date(input.facts.lastTurnAt);
  const { named: lines, media } = withReferences(input.lines);
  const newLines = newLinesOf(lines, lastTurnAt);
  const clock = { now: input.now, today: input.today, timeZone: input.timeZone };
  const customer = customerBlock({
    lead: input.lead,
    facts: input.facts,
    cameFrom: input.cameFrom,
    sheets: input.sheets,
    indexed: trips.indexed,
    today: input.today,
    timeZone: input.timeZone,
  });
  const history = oneHistory(
    lines.filter((line) => !newLines.includes(line)),
    clock,
    openingNotes(customer, input.summary),
  );
  const turn = turnMessage({ ...clock, notice: input.notice, newLines });
  const labels = new Map(input.sheets.map((sheet) => [sheet.label, sheet.packageId]));
  const all = oneToolSchemas({
    tripLabels: [...labels.keys()],
    brochureLabels: [...brochureLabelsOf(input.sheets).keys()],
    voiceNotes: [...media].filter(([, one]) => one.kind === "audio").map(([ref]) => ref),
    photos: [...media].filter(([, one]) => one.kind === "image").map(([ref]) => ref),
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
    media,
    newLines,
    tools: input.tools === "all" ? all : input.tools === "none" ? [] : all.filter((tool) => tool.name === "stay_quiet"),
  };
}
