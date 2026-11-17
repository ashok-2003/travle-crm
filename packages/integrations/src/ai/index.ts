// Public API of @travel-crm/integrations/ai: the AI port, its OpenRouter and in-memory adapters, a backup (ADR 0029), and
// the model with every call traced.
export {
  aiFeatures,
  audioFormatOf,
  NEXT_MODEL_MIN_LEFT_MS,
  type AiAudioFormat,
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
export { withTracing } from "./traced-model.js";
export { documentPages, documentText } from "./document-text.js";
