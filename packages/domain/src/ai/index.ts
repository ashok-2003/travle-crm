// Public API of @travel-crm/domain/ai: the AI, step 1 (ADR 0029; the owner's decisions of 2026-10-28): the agency's switch
// and instructions, what it tells its AI to know, Suggest reply with its monthly limit and its audit, and the AI's guess of
// how a lead will go. The AI never sends and never moves a lead's stage. It sits above crm and inbox, which it calls;
// nothing below calls it.
export type { AiModel } from "@travel-crm/integrations/ai";
export { aiAllowed } from "./allowed.js";
export { withdrawAiParts } from "./erasure.js";
export { recordDraftSent } from "./drafts.js";
export { AI_SCORE_QUEUE, leadInsightOf, scoreHandler, scoreLead, scoreOnCustomerWroteListener } from "./insight.js";
export {
  addKnowledge,
  aiDocumentListener,
  confirmDocument,
  deleteKnowledge,
  listKnowledge,
  requestDocument,
  updateKnowledge,
} from "./knowledge.js";
export { aiEnabled, aiSettingsOf, saveAiSettings } from "./settings.js";
export { suggestReply } from "./suggest.js";
export { MONTHLY_AI_LIMIT } from "./usage.js";
