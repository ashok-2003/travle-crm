// The AI model the features call (ADR 0029), built once per process: from AI_API_KEY with AI_BASE_URL and the models when
// those are set (any OpenAI-compatible endpoint, Google's Gemini direct included), with AI_BACKUP_API_KEY's AI behind it
// when that is set, else OpenRouter with its zero-data-retention routing from OPENROUTER_API_KEY. Null when no key is set:
// the features then say the AI isn't set up. The journeys' fake (AI_TEST_SERVER_URL, never in production) receives
// OpenRouter's calls in its place. Every call goes through the process's tracing (Langfuse, or none).
import {
  aiBaseUrl,
  createOpenRouterModel,
  isOpenRouterUrl,
  OPENROUTER_BASE_URL,
  withBackupModel,
  withTracing,
  type AiModel,
} from "@travel-crm/integrations/ai";
import { noTracing, type AiTracing } from "@travel-crm/integrations/tracing";
import type { Environment } from "./environment.js";

/** The settings that make the model: the bench reads just these, the processes the whole environment. */
export type AiSettings = Pick<
  Environment,
  | "AI_API_KEY"
  | "AI_BASE_URL"
  | "AI_CHAT_MODELS"
  | "AI_FAST_MODELS"
  | "AI_AGENT_MODELS"
  | "AI_ZERO_RETENTION"
  | "AI_BACKUP_API_KEY"
  | "AI_BACKUP_BASE_URL"
  | "AI_BACKUP_CHAT_MODELS"
  | "AI_BACKUP_FAST_MODELS"
  | "OPENROUTER_API_KEY"
  | "AI_SUGGEST_MODELS"
  | "AI_SCORE_MODELS"
  | "AI_TEST_SERVER_URL"
>;

/**
 * The model on one endpoint, with the natural sales agent kept to OpenRouter: the agent sends OpenRouter's reasoning field
 * and reads its reasoning details, which another endpoint would refuse or ignore. Off OpenRouter, every `sales_agent`
 * request answers not_configured, whatever model it names (a call pinned to the model that answered, Try it's Flash), so
 * a backup on OpenRouter serves it, and with none the agent isn't set up.
 */
function salesAgentOnOpenRouter(baseUrl: string | undefined, model: AiModel): AiModel {
  if (isOpenRouterUrl(aiBaseUrl(baseUrl))) return model;
  return {
    configured: model.configured,
    complete: (request) =>
      request.feature === "sales_agent"
        ? Promise.resolve({ ok: false, reason: "not_configured" })
        : model.complete(request),
  };
}

/**
 * The process's model, each call traced as one generation (under the agent's turn when one is running). The tracing wraps
 * the sales agent's gate, so a sales_agent call off OpenRouter is traced too, as the not_configured it answers.
 */
export function createAiModel(environment: AiSettings, tracing: AiTracing = noTracing): AiModel | null {
  const model = modelOf(environment);
  return model === null ? null : withTracing(model, tracing);
}

function modelOf(environment: AiSettings): AiModel | null {
  if (environment.AI_API_KEY !== undefined) {
    const chat = environment.AI_CHAT_MODELS ?? [];
    const fast = environment.AI_FAST_MODELS ?? chat;
    const zeroRetention =
      environment.AI_ZERO_RETENTION === undefined ? {} : { zeroRetention: environment.AI_ZERO_RETENTION };
    const first = createOpenRouterModel({
      apiKey: environment.AI_API_KEY,
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
        sales_agent: environment.AI_AGENT_MODELS ?? chat,
      },
      ...(environment.AI_BASE_URL === undefined ? {} : { baseUrl: environment.AI_BASE_URL }),
      ...zeroRetention,
    });
    if (environment.AI_BACKUP_API_KEY === undefined) return salesAgentOnOpenRouter(environment.AI_BASE_URL, first);
    // The backup keeps the first's endpoint and models unless it names its own.
    const backupChat = environment.AI_BACKUP_CHAT_MODELS ?? chat;
    const backupFast = environment.AI_BACKUP_FAST_MODELS ?? environment.AI_BACKUP_CHAT_MODELS ?? fast;
    const backupBaseUrl = environment.AI_BACKUP_BASE_URL ?? environment.AI_BASE_URL;
    const backup = createOpenRouterModel({
      apiKey: environment.AI_BACKUP_API_KEY,
      models: {
        suggest_reply: backupChat,
        autopilot: backupChat,
        score_lead: backupFast,
        fill_form: backupChat,
        write_up: backupChat,
        ask_report: backupFast,
        draft_days: backupChat,
        read_requests: backupFast,
        reach_out: backupChat,
        read_rates: backupChat,
        draft_packages: backupChat,
        sales_agent: environment.AI_BACKUP_CHAT_MODELS ?? environment.AI_AGENT_MODELS ?? chat,
      },
      ...(backupBaseUrl === undefined ? {} : { baseUrl: backupBaseUrl }),
      ...zeroRetention,
    });
    return withBackupModel(
      salesAgentOnOpenRouter(environment.AI_BASE_URL, first),
      salesAgentOnOpenRouter(backupBaseUrl, backup),
    );
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
      sales_agent: environment.AI_AGENT_MODELS ?? environment.AI_SUGGEST_MODELS,
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
