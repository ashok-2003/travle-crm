// The AI model the features call (ADR 0029), built once per process: from AI_API_KEY with AI_BASE_URL and the models when
// those are set (any OpenAI-compatible endpoint, Google's Gemini direct included), with AI_BACKUP_API_KEY's AI behind it
// when that is set, else OpenRouter with its zero-data-retention routing from OPENROUTER_API_KEY. Null when no key is set:
// the features then say the AI isn't set up. The journeys' fake (AI_TEST_SERVER_URL, never in production) receives
// OpenRouter's calls in its place.
import { createOpenRouterModel, OPENROUTER_BASE_URL, withBackupModel, type AiModel } from "@travel-crm/integrations/ai";
import type { Environment } from "./environment.js";

/** The settings that make the model: the bench reads just these, the processes the whole environment. */
export type AiSettings = Pick<
  Environment,
  | "AI_API_KEY"
  | "AI_BASE_URL"
  | "AI_CHAT_MODELS"
  | "AI_FAST_MODELS"
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

export function createAiModel(environment: AiSettings): AiModel | null {
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
      },
      ...(environment.AI_BASE_URL === undefined ? {} : { baseUrl: environment.AI_BASE_URL }),
      ...zeroRetention,
    });
    if (environment.AI_BACKUP_API_KEY === undefined) return first;
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
        draft_packages: backupChat,
      },
      ...(backupBaseUrl === undefined ? {} : { baseUrl: backupBaseUrl }),
      ...zeroRetention,
    });
    return withBackupModel(first, backup);
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
