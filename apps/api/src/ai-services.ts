// The AI model the features call (ADR 0029), built once per process: from AI_API_KEY with AI_BASE_URL and the models when
// those are set (any OpenAI-compatible endpoint, Google's Gemini direct included), else OpenRouter with its zero-data-retention
// routing from OPENROUTER_API_KEY. Null when no key is set: the features then say the AI isn't set up. The journeys' fake
// (AI_TEST_SERVER_URL, never in production) receives OpenRouter's calls in its place.
import { createOpenRouterModel, OPENROUTER_BASE_URL, type AiModel } from "@travel-crm/integrations/ai";
import type { Environment } from "./environment.js";

export function createAiModel(environment: Environment): AiModel | null {
  if (environment.AI_API_KEY !== undefined) {
    const chat = environment.AI_CHAT_MODELS ?? [];
    const fast = environment.AI_FAST_MODELS ?? chat;
    return createOpenRouterModel({
      apiKey: environment.AI_API_KEY,
      // The chat models write for customers and read chats; the fast ones only score leads.
      models: { suggest_reply: chat, autopilot: chat, learn: chat, score_lead: fast },
      ...(environment.AI_BASE_URL === undefined ? {} : { baseUrl: environment.AI_BASE_URL }),
      ...(environment.AI_ZERO_RETENTION === undefined ? {} : { zeroRetention: environment.AI_ZERO_RETENTION }),
    });
  }
  const apiKey = environment.OPENROUTER_API_KEY;
  if (apiKey === undefined) return null;
  const testServer = environment.AI_TEST_SERVER_URL;
  return createOpenRouterModel({
    apiKey,
    models: {
      suggest_reply: environment.AI_SUGGEST_MODELS,
      score_lead: environment.AI_SCORE_MODELS,
      // The autopilot and the nightly lessons write for customers and read many chats: the chat models do both.
      autopilot: environment.AI_SUGGEST_MODELS,
      learn: environment.AI_SUGGEST_MODELS,
    },
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
