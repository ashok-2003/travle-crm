// The in-memory AI adapter (ADR 0029): answers what a test scripted, in order, and keeps every request it was sent, so a
// test reads what the prompt held. Unscripted, it answers "not_configured", as an AI with no key does.
import type { AiModel, AiRequest, AiResult } from "./ai-model.js";

export interface MemoryAiModel extends AiModel {
  readonly requests: AiRequest[];
  /** Queues the next answers, plain text or a JSON object. */
  answer(...texts: (string | Record<string, unknown>)[]): void;
}

export function createMemoryAiModel(): MemoryAiModel {
  const requests: AiRequest[] = [];
  const answers: string[] = [];
  return {
    configured: true,
    models: { chat: ["memory-chat"], fast: ["memory-fast"] },
    requests,
    answer(...texts) {
      for (const text of texts) answers.push(typeof text === "string" ? text : JSON.stringify(text));
    },
    complete(request): Promise<AiResult> {
      requests.push(request);
      const text = answers.shift();
      return Promise.resolve(
        text === undefined
          ? { ok: false, reason: "not_configured" }
          : { ok: true, text, model: `memory-${request.tier}`, inputTokens: 0, outputTokens: 0 },
      );
    },
  };
}
