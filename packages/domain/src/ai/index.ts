// Public API of @travel-crm/domain/ai: the AI (ADR 0029; the owner's decisions of 2026-10-28): the agency's switch and
// instructions, what it tells its AI to know, Suggest reply with its monthly limit and its audit, the AI's guess of how a
// lead will go (it never moves a lead's stage), and the autopilot: the AI answering chats by itself, off until an Owner or
// Admin turns it on, marking and auditing every message it sends, with nudges, a staff member's style and nightly lessons, notes on leads, the agency's media and payment details, and the
// bookings it takes with the customer's payment proof, and the follow-ups it adds to leads and works when they come due
// (the Follow-ups screen). It sits above crm and inbox, which it calls;
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
export {
  AI_NUDGES_QUEUE,
  AI_REPLY_QUEUE,
  AI_LEARN_QUEUE,
  aiChatResumedListener,
  aiCustomerWroteListener,
  aiReplyHandler,
  runAiLearning,
  runAiNudges,
} from "./agent-worker.js";
export { AI_HANDOFF_KIND, AI_TOKEN_PREFIX, agentAnswers, runAgentTurn, type AgentDependencies } from "./agent.js";
export {
  AI_BOOKING_KIND,
  AI_PAYMENT_PROOF_KIND,
  aiPaymentProofListener,
  bookingsOfLead,
  setBookingStatus,
  type BookingRecipients,
} from "./booking.js";
export { confirmMedia, deleteMedia, listMedia, mediaLink, requestMedia, updateMedia } from "./media.js";
export { autopilotDefaults, autopilotOf, autopilotSettingsOf, saveAutopilot } from "./autopilot.js";
export { followUpBoardOf } from "./follow-up-board.js";
export { AI_CHAT_RESUMED_EVENT, chatAiOf, resumeChat, setChatMode, setChatPersona } from "./chat-state.js";
export { learnFromChats, learnNow, type LearnDependencies } from "./learning.js";
export { listLearnings, setLearning } from "./learning-store.js";
export { aiOverviewOf } from "./overview.js";
export { testAnswer } from "./test-answer.js";
export { clearVoice, learnVoice } from "./voice.js";
export { clearChatVoice, learnChatVoice } from "./chat-voice.js";
export { fillForm } from "./fill/engine.js";
export { recordFillApplied } from "./fill/applied.js";
export { confirmAiInput, requestAiInput } from "./fill/input.js";
export { callSaved, leadSaved, quoteSaved, tripSaved } from "./fill/saved.js";
