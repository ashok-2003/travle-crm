// The AI model Suggest reply drafts with (ADR 0029), built once per process: OpenRouter with its zero-data-retention routing,
// from the key and the models in the environment. Null when no key is set: the feature then says the AI isn't set up.
import { createOpenRouterModel, type AiModel } from "@travel-crm/integrations/ai";
import type { Environment } from "./environment.js";

export function createAiModel(environment: Environment): AiModel | null {
  const apiKey = environment.OPENROUTER_API_KEY;
  if (apiKey === undefined) return null;
  return createOpenRouterModel({ apiKey, models: { suggest_reply: environment.AI_SUGGEST_MODELS } });
}
