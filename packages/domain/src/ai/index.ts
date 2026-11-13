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
export { withIncidentReports } from "./reported-model.js";
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
export { agencyAnswersOf, agentBasicsOf, saveAgencyAnswers, saveAgentBasics } from "./agency-answers.js";
export { agentSetupOf, handedOverChatsOf, setAgentOn } from "./agent-setup.js";
export { aiEnabled, aiSettingsOf, saveAiSettings } from "./settings.js";
export { aiFilledLeadIds, decideSuggestions, suggestedFieldsOf } from "./fill/lead-fields.js";
export { suggestReply } from "./suggest.js";
export { MONTHLY_AI_LIMIT } from "./usage.js";
export {
  AI_NUDGES_QUEUE,
  AI_LITE_REPLY_QUEUE,
  AI_REPLY_QUEUE,
  AI_LEARN_QUEUE,
  aiChatResumedListener,
  aiCustomerWroteListener,
  aiReplyHandlers,
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
export { liteAgentOn, setLiteAgent } from "./lite/switch.js";
export { decideStageSuggestion, stageSuggestionOfLead, stageSuggestionsOf } from "./lite/suggestions.js";
export { autopilotDefaults, autopilotOf } from "./autopilot.js";
export { followUpBoardOf } from "./follow-up-board.js";
export { AI_CHAT_RESUMED_EVENT, chatAiOf, resumeChat, setChatMode } from "./chat-state.js";
export { learnFromChats, type LearnDependencies } from "./learning.js";
export { aiOverviewOf } from "./overview.js";
export { testAnswer } from "./test-answer.js";
export { fillForm } from "./fill/engine.js";
export { recordFillApplied } from "./fill/applied.js";
export { confirmAiInput, requestAiInput } from "./fill/input.js";
export { callSaved, leadSaved, quoteSaved, tripSaved } from "./fill/saved.js";
export { chooseReport, chosenFrom, type CatalogueEntry, type Chosen } from "./ask/choose.js";
export { writeUpQuote } from "./write-up/write-up.js";
export { readRoomRequests } from "./rooming/read-requests.js";
export { recordRoomRequestsApplied } from "./rooming/applied.js";
export { findInterestedPeople } from "./seats/interested.js";
export { writeSeatMessage } from "./seats/write-message.js";
export { recordOfferSent } from "./seats/sent.js";
export { readRateSheet } from "./rates/read-rate-sheet.js";
export { findTrips } from "./drafts/find-trips.js";
export { draftPackage } from "./drafts/draft-package.js";
export { recordRatesApplied } from "./rates/applied.js";
export { rateSheetSourceLink } from "./rates/source-link.js";
export type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
export { requestRateSheetUpload } from "./rates/input.js";
export {
  CASE_NOW,
  runAgentCase,
  scriptedModel,
  seedCaseAgency,
  type CaseCheck,
  type CaseResult,
} from "./grounded/evaluate.js";
export { TRACE_DAYS, traceKey, traceFileOf, readTraceFile, type TraceFile } from "./traces/trace-file.js";
export { keptTrace, keptTraces, traceMessages, type KeptTrace } from "./traces/trace-reads.js";
export { createTraceSink, forgetTraces, tracesDue } from "./traces/trace-sink.js";
export { startTrace } from "./lite/turn-trace.js";
export { promptLibrary, promptVersions, type PromptPiece } from "./lite/prompts/library.js";
export { modelCalls, type ModelCallOutline } from "./lite/prompts/calls.js";
export type { ContextMessage } from "./lite/types.js";
export type { BlockHead } from "./lite/context/block-heads.js";
export { BENCH_NOW, BENCH_OWNER_ID, seedBenchAgency } from "./bench/seed.js";
export { benchModel } from "./bench/script.js";
export {
  benchChecks,
  heldItems,
  inventedSpans,
  type BenchCheck,
  type BenchEnd,
  type BenchTurn,
  type Span,
} from "./bench/rubric.js";
export { runLiteCase, type LiteCaseResult } from "./bench/replay.js";
