// The in-memory AI adapter (ADR 0029): answers what a test scripted, in order, and keeps every request it was sent, so a
// test reads what the prompt held. Unscripted, it answers "not_configured", as an AI with no key does.
import type { AiFinishReason, AiModel, AiRequest, AiResult } from "./ai-model.js";

/** A scripted answer with more than words: tool calls (given ids "call_1", "call_2"… in order), a finish, a model. */
export interface MemoryAnswer {
  text?: string;
  toolCalls?: { name: string; arguments: object }[];
  /** "tool_calls" when there are calls, else "stop", unless set. */
  finishReason?: AiFinishReason;
  reasoningDetails?: unknown;
  /** The model that answered ("memory-model" unless set). */
  model?: string;
}

type Scripted = string | MemoryAnswer | Extract<AiResult, { ok: false }>;

export interface MemoryAiModel extends AiModel {
  readonly requests: AiRequest[];
  /** Queues the next answers: text, an answer with tool calls, or a refusal like the provider being down. */
  answer(...answers: Scripted[]): void;
}

export function createMemoryAiModel(): MemoryAiModel {
  const requests: AiRequest[] = [];
  const answers: Scripted[] = [];
  let calls = 0;
  const resultOf = (next: MemoryAnswer): AiResult => {
    const toolCalls = (next.toolCalls ?? []).map((call) => {
      calls += 1;
      return { id: `call_${String(calls)}`, name: call.name, arguments: JSON.stringify(call.arguments) };
    });
    return {
      ok: true,
      text: next.text ?? "",
      model: next.model ?? "memory-model",
      inputTokens: 0,
      outputTokens: 0,
      finishReason: next.finishReason ?? (toolCalls.length > 0 ? "tool_calls" : "stop"),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(next.reasoningDetails === undefined ? {} : { reasoningDetails: next.reasoningDetails }),
    };
  };
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
      if (typeof next === "string") {
        return Promise.resolve({ ok: true, text: next, model: "memory-model", inputTokens: 0, outputTokens: 0 });
      }
      return Promise.resolve("ok" in next ? next : resultOf(next));
    },
  };
}
