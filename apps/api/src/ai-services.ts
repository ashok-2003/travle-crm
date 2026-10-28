// The AI model Suggest reply drafts with (ADR 0029), built once per process: OpenRouter with its zero-data-retention routing,
// from the key and the models in the environment. Null when no key is set: the feature then says the AI isn't set up. The
// journeys' fake (AI_TEST_SERVER_URL, never in production) receives the adapter's calls in OpenRouter's place; the adapter
// itself still refuses any address but OpenRouter's, so only the transport is swapped.
import { createOpenRouterModel, OPENROUTER_BASE_URL, type AiModel } from "@travel-crm/integrations/ai";
import type { Environment } from "./environment.js";

export function createAiModel(environment: Environment): AiModel | null {
  const apiKey = environment.OPENROUTER_API_KEY;
  if (apiKey === undefined) return null;
  const testServer = environment.AI_TEST_SERVER_URL;
  return createOpenRouterModel({
    apiKey,
    models: { suggest_reply: environment.AI_SUGGEST_MODELS },
    ...(testServer === undefined
      ? {}
      : {
          fetch: (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
            fetch(
              typeof input === "string" ? input.replace(OPENROUTER_BASE_URL, testServer.replace(/\/+$/, "")) : input,
              init,
            ),
        }),
  });
}
