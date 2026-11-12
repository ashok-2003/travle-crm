// The Understand call: one model call whose answer must fit the strict form; the raw text is kept for the trace.
import { understandForm, type UnderstandForm } from "@travel-crm/contracts/ai";
import type { AiFailure, AiModel, AiRequest } from "@travel-crm/integrations/ai";
import { askFor } from "../grounded/ask.js";

export type Understood =
  | {
      ok: true;
      form: UnderstandForm;
      raw: string;
      usage: { model: string; inputTokens: number; outputTokens: number };
    }
  | { ok: false; reason: AiFailure | "unfit"; raw: string | null };

/** Never repaired and never asked twice: a form that does not fit is "unfit", and the caller decides what that costs. */
export async function understandChat(model: AiModel, request: AiRequest): Promise<Understood> {
  const asked = await askFor(model, request, understandForm);
  if (asked.ok) {
    return {
      ok: true,
      form: asked.value,
      raw: asked.raw,
      usage: { model: asked.model, inputTokens: asked.inputTokens, outputTokens: asked.outputTokens },
    };
  }
  return { ok: false, reason: asked.reason, raw: asked.reason === "unfit" ? asked.raw : null };
}
