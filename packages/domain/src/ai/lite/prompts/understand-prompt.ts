// The Understand call's request: the fixed pieces as the system message, the clean context blocks as the user message.
import { understandFormWireSchema } from "@travel-crm/contracts/ai";
import type { AiRequest } from "@travel-crm/integrations/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import { ANSWER_MAX_TOKENS } from "../../grounded/ask.js";
import { BUDGETS, newestThatFit, oneLine, renderBlock, summaryLines, type Block } from "../context/blocks.js";
import { leadCardLines } from "../context/lead-card.js";
import { messageLines } from "../context/messages.js";
import { packageIndexBlock, timelineLines, todayLine } from "../context/turn-blocks.js";
import type { ContextMessage, LeadCardFacts, PackageIndexEntry, TimelineLine } from "../types.js";
import { understandBlockHeads } from "../context/block-heads.js";
import { UNDERSTAND_ANSWER, UNDERSTAND_SYSTEM } from "./calls.js";
import { promptLibrary } from "./library.js";

const LAST_MESSAGES = 20;

export interface UnderstandPromptInput {
  agencyName: string;
  packages: PackageIndexEntry[];
  now: Date;
  today: CalendarDate;
  timeZone: string;
  lead: LeadCardFacts | null;
  summary: string;
  timeline: TimelineLine[];
  messages: ContextMessage[];
}

/** The fixed system message: the same bytes every turn, so the provider can cache it. */
export function understandSystem(): string {
  const text = new Map(promptLibrary().map((piece) => [piece.name, piece.text]));
  return UNDERSTAND_SYSTEM.map((name) => text.get(name) ?? "").join("\n\n");
}

export function understandRequest(input: UnderstandPromptInput): {
  request: AiRequest;
  blocks: Record<string, string>;
  messageIds: string[];
} {
  const recent = input.messages.slice(-LAST_MESSAGES);
  const lines = messageLines(recent, input.timeZone, input.today);
  const kept = newestThatFit(lines, BUDGETS.messages);
  const shown = recent.slice(recent.length - kept);
  const blocks: Block[] = [
    {
      ...understandBlockHeads.agency,
      lines: [oneLine(input.agencyName)],
    },
    packageIndexBlock(input.packages),
    {
      ...understandBlockHeads.today,
      lines: [todayLine(input.today, input.timeZone)],
    },
    {
      ...understandBlockHeads.leadCard,
      lines: input.lead === null ? [] : leadCardLines(input.lead, input.today),
    },
    {
      ...understandBlockHeads.summary,
      lines: summaryLines(input.summary),
    },
    {
      ...understandBlockHeads.timeline,
      lines: timelineLines(input.timeline, input.timeZone, input.today),
    },
    {
      ...understandBlockHeads.messages,
      lines: lines.slice(lines.length - kept),
    },
  ];
  const rendered = blocks.map((block) => [block.title, renderBlock(block)] as const).filter(([, text]) => text !== "");
  return {
    request: {
      feature: "autopilot",
      maxTokens: ANSWER_MAX_TOKENS,
      schema: { name: UNDERSTAND_ANSWER, jsonSchema: understandFormWireSchema },
      messages: [
        { role: "system", content: understandSystem() },
        { role: "user", content: rendered.map(([, text]) => text).join("\n\n") },
      ],
    },
    blocks: Object.fromEntries(rendered),
    messageIds: shown.map((message) => message.id),
  };
}
