// An in-memory bot check for tests: it answers what it was told to and records what it was asked.
import type { BotCheck, BotCheckResult } from "./bot-check.js";

export interface MemoryBotCheck extends BotCheck {
  /** The answer for every later check (pass until told otherwise). */
  willAnswer(result: BotCheckResult): void;
  seen(): { token: string; address: string | null }[];
}

export function createMemoryBotCheck(): MemoryBotCheck {
  let answer: BotCheckResult = "pass";
  const seen: { token: string; address: string | null }[] = [];
  return {
    willAnswer: (result) => {
      answer = result;
    },
    seen: () => [...seen],
    verify: (input) => {
      seen.push({ token: input.token, address: input.address });
      return Promise.resolve(answer);
    },
  };
}
