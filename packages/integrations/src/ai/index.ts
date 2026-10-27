// Public API of @travel-crm/integrations/ai: the AI port, its OpenAI-compatible and in-memory adapters (ADR 0029), and the
// text of a document the agency gives its AI.
export type { AiMessage, AiModel, AiRequest, AiResult } from "./ai-model.js";
export { createOpenAiCompatibleModel, type OpenAiCompatibleOptions } from "./openai-compatible.js";
export { createMemoryAiModel, type MemoryAiModel } from "./memory-ai.js";
export { documentText } from "./document-text.js";
