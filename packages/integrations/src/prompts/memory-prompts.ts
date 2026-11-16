// The in-memory prompts adapter: answers the prompts it was given, by name and label, and records each ask, so a test
// reads which prompt a caller wanted and how.
import type { AiPrompts, ManagedPrompt } from "./ai-prompts.js";

export interface MemoryPrompts extends AiPrompts {
  readonly asked: { name: string; label: string; fresh: boolean }[];
}

export function createMemoryPrompts(prompts: readonly ManagedPrompt[] = []): MemoryPrompts {
  const asked: MemoryPrompts["asked"] = [];
  return {
    asked,
    textPrompt(name, label, request = {}) {
      asked.push({ name, label, fresh: request.fresh === true });
      const found = prompts.find((prompt) => prompt.name === name && prompt.label === label);
      return Promise.resolve(found === undefined ? null : { ...found });
    },
  };
}
