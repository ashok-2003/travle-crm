// Public API of @travel-crm/domain/ai: Suggest reply (ADR 0029; the owner's decision of 2026-10-28): the agency's switch and
// instructions, the draft the AI makes in a chat, its monthly limit, and the audit of a reply sent from a draft. The AI
// never sends and never acts on its own. It sits above crm and inbox, which it calls; nothing below calls it.
export type { AiModel } from "@travel-crm/integrations/ai";
export { withdrawAiDrafts } from "./erasure.js";
export { recordDraftSent } from "./drafts.js";
export { aiEnabled, aiSettingsOf, saveAiSettings } from "./settings.js";
export { suggestReply } from "./suggest.js";
export { MONTHLY_SUGGESTION_LIMIT } from "./usage.js";
