// Asks the AI port for an answer that fits a contract: the value, or why there is none. Prose and wrong shapes are never repaired.
import type { AiFailure, AiModel, AiRequest } from "@travel-crm/integrations/ai";
import { jsonObjectIn } from "../fill/json.js";

/**
 * The answer budget of the turn's read and write calls, the old agent's own (commit 53b71290): a thinking model spends
 * part of it reasoning, and a cut-off answer is no JSON.
 */
export const ANSWER_MAX_TOKENS = 2500;

/** What askFor needs of a Zod schema, so the domain package takes no dependency on zod itself. */
export interface Contract<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

export type Asked<T> =
  | { ok: true; value: T; raw: string; model: string; inputTokens: number; outputTokens: number }
  /** `raw` is the model's text when it answered but did not fit, so a trace can show what it said. */
  | { ok: false; reason: AiFailure }
  | { ok: false; reason: "unfit"; raw: string };

/**
 * Calls the model with `request.schema` and keeps the answer only when its JSON object fits the contract. It neither
 * reserves nor releases the monthly limit: the caller reserves one call first (`reserveAiCall`) and gives it back when
 * the answer is a failure or "unfit".
 */
export async function askFor<T>(model: AiModel, request: AiRequest, contract: Contract<T>): Promise<Asked<T>> {
  const result = await model.complete(request);
  if (!result.ok) return { ok: false, reason: result.reason };
  const parsed = contract.safeParse(jsonObjectIn(result.text));
  if (!parsed.success) return { ok: false, reason: "unfit", raw: result.text };
  return {
    ok: true,
    value: parsed.data,
    raw: result.text,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
