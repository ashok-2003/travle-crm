// The in-memory AI adapter (ADR 0029): answers what a test scripted, in order, and keeps every request it was sent, so a
// test reads what the prompt held. Unscripted, it answers "not_configured", as an AI with no key does.
import type { AiModel, AiRequest, AiResult } from "./ai-model.js";

export interface MemoryAiModel extends AiModel {
  readonly requests: AiRequest[];
  /** Queues the next answers: text, or a refusal like the provider being down. */
  answer(...answers: (string | Extract<AiResult, { ok: false }>)[]): void;
}

export function createMemoryAiModel(): MemoryAiModel {
  const requests: AiRequest[] = [];
  const answers: (string | Extract<AiResult, { ok: false }>)[] = [];
  return {
    configured: true,
    requests,
    answer(...next) {
      answers.push(...next);
    },
    complete(request): Promise<AiResult> {
      requests.push(request);
      const next = answers.shift();
      if (next === undefined) return Promise.resolve({ ok: false, reason: "not_configured" });
      return Promise.resolve(typeof next === "string" ? { ok: true, text: next, model: "memory-model" } : next);
    },
  };
}
