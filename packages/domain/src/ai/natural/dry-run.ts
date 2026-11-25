// Try it's test chat as chat lines: the lines up to our last stand at the last turn's time (now, in a new chat) and the
// customer's after it at now (pre-flight #10), so the offer, the new lines and the told totals read as they would live.
import type { NaturalTestState, TestAiLine } from "@travel-crm/contracts/ai";
import type { NaturalPrompt } from "./prompt.js";
import type { NaturalChatLine } from "./types.js";

export interface NaturalTestChat {
  messages: readonly TestAiLine[];
  state: NaturalTestState | null;
  prompt: NaturalPrompt;
  model?: string;
  temperature?: number;
}

/** The posted lines: the customer's as theirs, the agent's (its messages and marks) as ours. */
export function chatLinesOf(messages: readonly TestAiLine[], lastTurnAt: string | null, now: Date): NaturalChatLine[] {
  const ours = messages.findLastIndex((line) => line.from === "agent");
  const before = lastTurnAt === null ? now : new Date(lastTurnAt);
  return messages.map((line, index) => ({
    id: `dry-run-${String(index + 1)}`,
    from: line.from === "customer" ? "customer" : "you",
    at: index <= ours ? before : now,
    kind: "text",
    text: line.text,
  }));
}
