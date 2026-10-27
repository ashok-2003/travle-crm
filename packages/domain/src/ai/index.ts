// Public API of @travel-crm/domain/ai: the AI sales agent (the owner's widening of ADR 0029, 2026-10-27 and 2026-10-28).
// It answers customers on WhatsApp inside the window from the agency's knowledge and sells like a closer, follows quiet
// ones up when it judges best, remembers each chat, flags the team or hands a chat to a person as the agency chose,
// scores each lead, and learns from the agency's chats. It sits above crm and inbox, which it calls; nothing below
// calls it.
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
export { learnFromChats, learnNow, type LearnDependencies } from "./learning.js";
export { listLearnings, setLearning } from "./learning-store.js";
export { aiOverviewOf } from "./overview.js";
export { agencyVoiceOf, clearVoice, learnVoice, setChatPersona } from "./voice.js";
export { aiSettingsOf, defaultAiSettings, saveAiSettings } from "./settings.js";
export {
  AI_LEARN_QUEUE,
  AI_NUDGES_QUEUE,
  AI_REPLY_QUEUE,
  aiCustomerWroteListener,
  aiDocumentListener,
  aiReplyHandler,
  runAiLearning,
  runAiNudges,
} from "./worker.js";
