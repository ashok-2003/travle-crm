// The chat the one agent reads: every line, whole (a line is cut only past 4,000 characters), as user and assistant
// messages, with the earlier system's lines marked as older and a summary, when there is one, first.
import type { AiMessage } from "@travel-crm/integrations/ai";
import { lineWords, stampOf, type ChatClock } from "../natural/context/chat-turns.js";
import { oneLine } from "../lite/context/blocks.js";
import type { NaturalChatLine } from "../natural/types.js";

export const ONE_LINE_CUT = 4_000;
export const EARLIER_HEADING = "Earlier system (an older system; its prices, dates and promises may be wrong):";
export const SUMMARY_MARK = "[chat summary, not from the customer]";

function writtenLine(line: NaturalChatLine, clock: ChatClock): string {
  const words = lineWords(line, ONE_LINE_CUT, { earlierWhole: true });
  switch (line.from) {
    case "customer":
      return `[${stampOf(line.at, clock)}] ${words}`;
    case "team": {
      const name = line.teamName === undefined || line.teamName.trim() === "" ? "" : `, ${oneLine(line.teamName)}`;
      return `(Team${name}) ${words}`;
    }
    case "automatic":
      return `[automatic] ${words}`;
    default:
      return words;
  }
}

/** The chat before the new lines as user and assistant messages; a summary, when given, first. */
export function oneHistory(lines: readonly NaturalChatLine[], clock: ChatClock, summary: string | null): AiMessage[] {
  const messages: AiMessage[] = summary === null ? [] : [{ role: "assistant", content: `${SUMMARY_MARK}\n${summary}` }];
  let previous: NaturalChatLine | undefined;
  for (const line of lines) {
    // The heading goes once before a run of earlier lines.
    const written = writtenLine(line, clock);
    const text = line.from === "earlier" && previous?.from !== "earlier" ? `${EARLIER_HEADING}\n${written}` : written;
    const role = line.from === "customer" ? "user" : "assistant";
    const last = messages.at(-1);
    if (last?.role === role) last.content = `${last.content}\n${text}`;
    else messages.push({ role, content: text });
    previous = line;
  }
  return messages;
}
