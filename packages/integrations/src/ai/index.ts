// Public API of @travel-crm/integrations/ai: the AI port, its OpenRouter and in-memory adapters, and a backup (ADR 0029).
export {
  aiFeatures,
  type AiEffort,
  type AiFailure,
  type AiFeature,
  type AiFinishReason,
  type AiMessage,
  type AiModel,
  type AiPart,
  type AiRequest,
  type AiResult,
  type AiTool,
  type AiToolCall,
} from "./ai-model.js";
export {
  aiBaseUrl,
  createOpenRouterModel,
  isOpenRouterUrl,
  wireMessage,
  OPENROUTER_BASE_URL,
  type OpenRouterOptions,
} from "./openrouter.js";
export { createMemoryAiModel, type MemoryAiModel, type MemoryAnswer } from "./memory-ai.js";
export { withBackupModel } from "./fallback.js";
export { documentPages, documentText } from "./document-text.js";
