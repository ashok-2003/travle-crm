// The Write call's request: the fixed pieces as the system message, then the move, its facts and a short chat.
import { liteWriteAnswerJsonSchema, type LiteLanguage } from "@travel-crm/contracts/ai";
import type { AiRequest } from "@travel-crm/integrations/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import { ANSWER_MAX_TOKENS } from "../../grounded/ask.js";
import { BUDGETS, newestThatFit, oneLine, renderBlock, summaryLines, type Block } from "../context/blocks.js";
import { messageLines } from "../context/messages.js";
import type { ContextMessage } from "../types.js";
import { writeBlockHeads } from "../context/block-heads.js";
import { WRITE_ANSWER, WRITE_SYSTEM } from "./calls.js";
import { promptLibrary } from "./library.js";

const LAST_MESSAGES = 6;
const tones = {
  friendly: "friendly (warm, simple words)",
  professional: "professional (polite and plain, no emoji)",
} as const;
const languages: Record<LiteLanguage, string> = {
  english: "English",
  hindi: "Hindi, in Devanagari",
  hinglish: "Hinglish, in Latin letters",
};

export interface WritePromptInput {
  agentName: string;
  agencyName: string;
  tone: "friendly" | "professional";
  instruction: string;
  facts: string[];
  looked: string[];
  summary: string;
  messages: ContextMessage[];
  language: LiteLanguage;
  correction: string | null;
  /** The agency's zone and the day it is there: a nudge turn has no new message to read them from. */
  timeZone: string;
  today: CalendarDate;
}

/** The fixed system message: the same bytes every turn. */
export function writeSystem(): string {
  const text = new Map(promptLibrary().map((piece) => [piece.name, piece.text]));
  return WRITE_SYSTEM.map((name) => text.get(name) ?? "").join("\n\n");
}

export function writeRequest(input: WritePromptInput): { request: AiRequest; blocks: Record<string, string> } {
  const recent = input.messages.slice(-LAST_MESSAGES);
  const lines = messageLines(recent, input.timeZone, input.today);
  const blocks: Block[] = [
    {
      ...writeBlockHeads.you,
      lines: [`Name: ${oneLine(input.agentName)}. Agency: ${oneLine(input.agencyName)}. Tone: ${tones[input.tone]}`],
    },
    {
      ...writeBlockHeads.move,
      lines: input.instruction.split("\n"),
    },
    {
      ...writeBlockHeads.facts,
      lines: input.facts,
    },
    {
      ...writeBlockHeads.lookedUp,
      lines: input.looked,
    },
    {
      ...writeBlockHeads.summary,
      lines: summaryLines(input.summary),
    },
    {
      ...writeBlockHeads.messages,
      lines: lines.slice(lines.length - newestThatFit(lines, BUDGETS.writeMessages)),
    },
    {
      ...writeBlockHeads.language,
      lines: [languages[input.language]],
    },
    {
      ...writeBlockHeads.correction,
      lines: input.correction === null ? [] : [`Your last answer was refused: ${input.correction}. Write it again.`],
    },
  ];
  const rendered = blocks.map((block) => [block.title, renderBlock(block)] as const).filter(([, text]) => text !== "");
  return {
    request: {
      feature: "autopilot",
      maxTokens: ANSWER_MAX_TOKENS,
      schema: { name: WRITE_ANSWER, jsonSchema: liteWriteAnswerJsonSchema },
      messages: [
        { role: "system", content: writeSystem() },
        { role: "user", content: rendered.map(([, text]) => text).join("\n\n") },
      ],
    },
    blocks: Object.fromEntries(rendered),
  };
}
