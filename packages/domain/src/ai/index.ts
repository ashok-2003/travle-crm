// Public API of @travel-crm/domain/ai: the AI sales agent (the owner's widening of ADR 0029, 2026-10-27). It answers
// customers on WhatsApp inside the window from the agency's knowledge, nudges quiet ones, remembers each chat, hands a
// chat to a person when it must, and scores each lead. It sits above crm and inbox, which it calls; nothing below calls it.
export type { AiModel } from "@travel-crm/integrations/ai";
export { AI_HANDOFF_KIND, agentAnswers, parseAnswer, runAgentTurn, type AgentDependencies } from "./agent.js";
export {
  chatAiOf,
  leadInsightOf,
  leadScoresOf,
  resumeChat,
  setChatMode,
  suggestReply,
  testAnswer,
  type AiAssistDependencies,
} from "./chat.js";
export {
  AI_DOCUMENT_ADDED_EVENT,
  addKnowledge,
  confirmDocument,
  deleteKnowledge,
  listKnowledge,
  requestDocument,
  updateKnowledge,
} from "./knowledge.js";
export { aiSettingsOf, defaultAiSettings, saveAiSettings } from "./settings.js";
export {
  AI_NUDGES_QUEUE,
  AI_REPLY_QUEUE,
  aiCustomerWroteListener,
  aiDocumentListener,
  aiReplyHandler,
  runAiNudges,
} from "./worker.js";
