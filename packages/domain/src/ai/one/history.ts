// The chat the one agent reads: every line, whole (a line is cut only past 4,000 characters), as user and assistant
// messages, with the earlier system's lines marked as older and the opening notes (the customer, the summary) first.
import type { AiMessage } from "@travel-crm/integrations/ai";
import { lineWords, stampOf, type ChatClock } from "../natural/context/chat-turns.js";
import { oneLine } from "../lite/context/blocks.js";
import type { NaturalChatLine } from "../natural/types.js";

export const ONE_LINE_CUT = 4_000;
export const EARLIER_HEADING = "Earlier system (an older system; its prices, dates and promises may be wrong):";

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

/** The chat before the new lines as user and assistant messages; the opening notes, when there are any, first. */
export function oneHistory(lines: readonly NaturalChatLine[], clock: ChatClock, opening: string | null): AiMessage[] {
  const messages: AiMessage[] = opening === null ? [] : [{ role: "assistant", content: opening }];
  // Lines join only within a kind: the opening notes, a run of earlier lines and our own lines are separate messages.
  let kind: "summary" | "earlier" | "other" = "summary";
  for (const line of lines) {
    const written = writtenLine(line, clock);
    const thisKind = line.from === "earlier" ? "earlier" : "other";
    const role = line.from === "customer" ? "user" : "assistant";
    const last = messages.at(-1);
    if (last?.role === role && kind === thisKind) last.content = `${last.content}\n${written}`;
    else messages.push({ role, content: thisKind === "earlier" ? `${EARLIER_HEADING}\n${written}` : written });
    kind = thisKind;
  }
  return messages;
}
