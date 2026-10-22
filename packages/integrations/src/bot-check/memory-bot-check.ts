// An in-memory bot check for tests: it answers what it was told to and records what it was asked.
import type { BotCheck, BotCheckResult } from "./bot-check.js";

export interface MemoryBotCheck extends BotCheck {
  /** The answer for every later check (pass until told otherwise). */
  willAnswer(result: BotCheckResult): void;
  seen(): { token: string }[];
}

export function createMemoryBotCheck(): MemoryBotCheck {
  let answer: BotCheckResult = "pass";
  const seen: { token: string }[] = [];
  return {
    willAnswer: (result) => {
      answer = result;
    },
    seen: () => [...seen],
    verify: (input) => {
      seen.push({ token: input.token });
      return Promise.resolve(answer);
    },
  };
}
