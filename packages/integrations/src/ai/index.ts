// Public API of @travel-crm/integrations/ai: the AI port, its OpenRouter and in-memory adapters (ADR 0029).
export { aiFeatures, type AiFeature, type AiMessage, type AiModel, type AiRequest, type AiResult } from "./ai-model.js";
export {
  aiBaseUrl,
  createOpenRouterModel,
  isOpenRouterUrl,
  OPENROUTER_BASE_URL,
  type OpenRouterOptions,
} from "./openrouter.js";
export { createMemoryAiModel, type MemoryAiModel } from "./memory-ai.js";
export { documentText } from "./document-text.js";
