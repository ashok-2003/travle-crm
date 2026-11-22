// The AI model the features call (ADR 0029), built once per process: from AI_API_KEY with AI_BASE_URL and the models when
// those are set (any OpenAI-compatible endpoint, Google's Gemini direct included), or from AI_VERTEX_SERVICE_ACCOUNT's
// token in the key's place (Gemini on Vertex AI, ruling R14), with AI_BACKUP_API_KEY's AI behind it when that is set (and
// AI_BACKUP_API_KEY_2's, on the same endpoint and models, behind that), then the fallback providers (AI_FALLBACK_* and
// AI_FALLBACK_2_*, each its own endpoint, key and models), else OpenRouter with its zero-data-retention
// routing from OPENROUTER_API_KEY. Null when no key is set: the features then say the AI isn't set up. The journeys' fake
// (AI_TEST_SERVER_URL, never in production) receives OpenRouter's calls in its place. Every call goes through the
// process's tracing (Langfuse, or none).
import {
  createOpenRouterModel,
  OPENROUTER_BASE_URL,
  serviceAccountToken,
  withModelChain,
  withTracing,
  type AiModel,
} from "@travel-crm/integrations/ai";
import type { Logger } from "@travel-crm/integrations/logging";
import { noTracing, type AiTracing } from "@travel-crm/integrations/tracing";
import type { Environment } from "./environment.js";

/** The settings that make the model: the bench reads just these, the processes the whole environment. */
export type AiSettings = Pick<
  Environment,
  | "AI_API_KEY"
  | "AI_VERTEX_SERVICE_ACCOUNT"
  | "AI_BASE_URL"
  | "AI_CHAT_MODELS"
  | "AI_FAST_MODELS"
  | "AI_AGENT_MODELS"
  | "AI_VOICE_MODELS"
  | "AI_IMAGE_MODELS"
  | "AI_SUMMARY_MODELS"
  | "AI_ZERO_RETENTION"
  | "AI_BACKUP_API_KEY"
  | "AI_BACKUP_API_KEY_2"
  | "AI_BACKUP_BASE_URL"
  | "AI_BACKUP_CHAT_MODELS"
  | "AI_BACKUP_FAST_MODELS"
  | "AI_FALLBACK_BASE_URL"
  | "AI_FALLBACK_API_KEY"
  | "AI_FALLBACK_MODELS"
  | "AI_FALLBACK_2_BASE_URL"
  | "AI_FALLBACK_2_API_KEY"
  | "AI_FALLBACK_2_MODELS"
  | "OPENROUTER_API_KEY"
  | "AI_SUGGEST_MODELS"
  | "AI_SCORE_MODELS"
  | "AI_TEST_SERVER_URL"
>;

/**
 * The process's model, each call traced as one generation (under the agent's turn when one is running). The logger hears
 * only why a service account's token failed, by name and code.
 */
export function createAiModel(environment: AiSettings, logger: Logger, tracing: AiTracing = noTracing): AiModel | null {
  const model = modelOf(environment, logger);
  return model === null ? null : withTracing(model, tracing);
}

/** The agent's models, and its other uses' own lists (the owner, 2026-11-17), each the agent's when unset. */
function agentModels(
  own: Partial<Pick<AiSettings, "AI_VOICE_MODELS" | "AI_IMAGE_MODELS" | "AI_SUMMARY_MODELS">>,
  agent: readonly string[],
) {
  return {
    sales_agent: agent,
    agent_voice: own.AI_VOICE_MODELS ?? agent,
    agent_image: own.AI_IMAGE_MODELS ?? agent,
    chat_summary: own.AI_SUMMARY_MODELS ?? agent,
  };
}

/** Each 429 a key gets, logged by the key's setting name (never the key), so how often each runs out can be watched. */
const logRateLimits =
  (logger: Logger, setting: string) =>
  (event: { model: string; feature: string; restMs: number }): void => {
    logger.warn(
      { setting, model: event.model, feature: event.feature, restSeconds: Math.round(event.restMs / 1000) },
      "AI rate limited (429)",
    );
  };

/**
 * The fallback providers behind every key (the owner, 2026-11-23: free tiers catch what every key refused), each with its
 * own endpoint, key and models for every feature. OpenRouter's free models have no zero-data-retention route, so a
 * fallback never asks for one.
 */
function fallbackModels(environment: AiSettings, logger: Logger): AiModel[] {
  const slots = [
    [
      "AI_FALLBACK_API_KEY",
      environment.AI_FALLBACK_API_KEY,
      environment.AI_FALLBACK_BASE_URL,
      environment.AI_FALLBACK_MODELS,
    ],
    [
      "AI_FALLBACK_2_API_KEY",
      environment.AI_FALLBACK_2_API_KEY,
      environment.AI_FALLBACK_2_BASE_URL,
      environment.AI_FALLBACK_2_MODELS,
    ],
  ] as const;
  return slots.flatMap(([setting, apiKey, baseUrl, list]) =>
    apiKey === undefined || baseUrl === undefined || list === undefined
      ? []
      : [
          createOpenRouterModel({
            apiKey,
            baseUrl,
            models: {
              suggest_reply: list,
              autopilot: list,
              score_lead: list,
              fill_form: list,
              write_up: list,
              ask_report: list,
              read_requests: list,
              read_rates: list,
              reach_out: list,
              draft_days: list,
              draft_packages: list,
              ...agentModels({}, list),
            },
            zeroRetention: false,
            onRateLimited: logRateLimits(logger, setting),
          }),
        ],
  );
}

// The owner allowed the sales agent on Gemini direct as a proof of concept (2026-11-17); zero data retention is to be
// revisited before scale.
function modelOf(environment: AiSettings, logger: Logger): AiModel | null {
  // One credential for every feature: the service account (its token kept and renewed for the process's life), or the key.
  const vertex = environment.AI_VERTEX_SERVICE_ACCOUNT;
  // Never a token to the adapter's default address (OpenRouter's): the bench skips the start-up check that refuses this.
  if (vertex !== undefined && environment.AI_BASE_URL === undefined) return null;
  const credential = vertex === undefined ? environment.AI_API_KEY : serviceAccountToken(vertex, logger);
  if (credential !== undefined) {
    const chat = environment.AI_CHAT_MODELS ?? [];
    const fast = environment.AI_FAST_MODELS ?? chat;
    const zeroRetention =
      environment.AI_ZERO_RETENTION === undefined ? {} : { zeroRetention: environment.AI_ZERO_RETENTION };
    const agent = agentModels(environment, environment.AI_AGENT_MODELS ?? chat);
    const first = createOpenRouterModel({
      apiKey: credential,
      // The chat models write for customers and read chats; the fast ones only score leads.
      // Fill it for me reads recordings and screenshots, so it needs a multimodal model: Gemini's chat models are.
      models: {
        suggest_reply: chat,
        autopilot: chat,
        score_lead: fast,
        fill_form: chat,
        write_up: chat,
        ask_report: fast,
        // Reading a traveller's notes is short; a message to a customer is written well.
        read_requests: fast,
        // A rate sheet is long and its prices matter: the chat models read it.
        read_rates: chat,
        reach_out: chat,
        // Drafting a plan is longer writing than a reply: the chat models.
        draft_days: chat,
        draft_packages: chat,
        ...agent,
      },
      ...(environment.AI_BASE_URL === undefined ? {} : { baseUrl: environment.AI_BASE_URL }),
      ...zeroRetention,
      onRateLimited: logRateLimits(logger, vertex === undefined ? "AI_API_KEY" : "AI_VERTEX_SERVICE_ACCOUNT"),
    });
    const fallbacks = fallbackModels(environment, logger);
    if (environment.AI_BACKUP_API_KEY === undefined) {
      return fallbacks.length === 0 ? first : withModelChain([first, ...fallbacks]);
    }
    // The backup keeps the first's endpoint and models unless it names its own.
    const backupChat = environment.AI_BACKUP_CHAT_MODELS ?? chat;
    const backupFast = environment.AI_BACKUP_FAST_MODELS ?? environment.AI_BACKUP_CHAT_MODELS ?? fast;
    const backupBaseUrl = environment.AI_BACKUP_BASE_URL ?? environment.AI_BASE_URL;
    const backup = (apiKey: string, name: string) =>
      createOpenRouterModel({
        apiKey,
        models: {
          suggest_reply: backupChat,
          autopilot: backupChat,
          score_lead: backupFast,
          fill_form: backupChat,
          write_up: backupChat,
          ask_report: backupFast,
          draft_days: backupChat,
          draft_packages: backupChat,
          // The backup's own chat models serve every agent use; without them, the first's lists.
          ...(environment.AI_BACKUP_CHAT_MODELS === undefined
            ? agent
            : agentModels({}, environment.AI_BACKUP_CHAT_MODELS)),
        },
        ...(backupBaseUrl === undefined ? {} : { baseUrl: backupBaseUrl }),
        ...zeroRetention,
        onRateLimited: logRateLimits(logger, name),
      });
    const second = environment.AI_BACKUP_API_KEY_2;
    return withModelChain([
      first,
      backup(environment.AI_BACKUP_API_KEY, "AI_BACKUP_API_KEY"),
      ...(second === undefined ? [] : [backup(second, "AI_BACKUP_API_KEY_2")]),
      ...fallbacks,
    ]);
  }
  const apiKey = environment.OPENROUTER_API_KEY;
  if (apiKey === undefined) return null;
  const testServer = environment.AI_TEST_SERVER_URL;
  return createOpenRouterModel({
    apiKey,
    models: {
      suggest_reply: environment.AI_SUGGEST_MODELS,
      score_lead: environment.AI_SCORE_MODELS,
      // The agent writes for customers and reads chats: the chat models do both.
      autopilot: environment.AI_SUGGEST_MODELS,
      fill_form: environment.AI_SUGGEST_MODELS,
      write_up: environment.AI_SUGGEST_MODELS,
      ask_report: environment.AI_SCORE_MODELS,
      read_requests: environment.AI_SCORE_MODELS,
      read_rates: environment.AI_SUGGEST_MODELS,
      reach_out: environment.AI_SUGGEST_MODELS,
      draft_days: environment.AI_SUGGEST_MODELS,
      draft_packages: environment.AI_SUGGEST_MODELS,
      ...agentModels(environment, environment.AI_AGENT_MODELS ?? environment.AI_SUGGEST_MODELS),
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
