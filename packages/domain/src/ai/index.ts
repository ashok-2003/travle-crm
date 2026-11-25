// Public API of @travel-crm/domain/ai: the AI (ADR 0029; the owner's decisions of 2026-10-28): the agency's switch, the
// documents package drafts are written from, Suggest reply with its monthly limit and its audit, the AI's guess of how a
// lead will go (it never moves a lead's stage), and the one WhatsApp agent (the lite turn): the AI answering chats by
// itself, off until an Owner or Admin turns it on, marking and auditing every message it sends, with two follow-ups per
// silence, the bookings it takes with the customer's payment proof, and the traces of its turns. It sits above crm and
// inbox, which it calls; nothing below calls it.
export type { AiModel } from "@travel-crm/integrations/ai";
export type { AiPrompts } from "@travel-crm/integrations/prompts";
export type { ToolAgent } from "@travel-crm/integrations/tool-agent";
export type { AiTracing } from "@travel-crm/integrations/tracing";
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
export {
  agencyAnswersOf,
  agencyContactOf,
  agentBasicsOf,
  saveAgencyAnswers,
  saveAgentBasics,
  type AgencyContact,
} from "./agency-answers.js";
export { agentSetupOf, countHandedOver, handedOverChatsOf, setAgentOn } from "./agent-setup.js";
export { aiEnabled, aiSettingsOf, saveAiSettings } from "./settings.js";
export { aiFilledLeadIds, decideSuggestions, suggestedFieldsOf } from "./fill/lead-fields.js";
export { suggestReply } from "./suggest.js";
export { MONTHLY_AI_LIMIT } from "./usage.js";
export {
  AI_NUDGES_QUEUE,
  AI_REPLY_QUEUE,
  aiChatResumedListener,
  aiCustomerWroteListener,
  aiReplyHandler,
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
export {
  countOpenSuggestions,
  decideStageSuggestion,
  stageSuggestionOfLead,
  stageSuggestionsOf,
} from "./lite/suggestions.js";
export { leadsNeedingPerson } from "./needs-person.js";
export { autopilotDefaults, autopilotOf } from "./autopilot.js";
export { followUpBoardOf } from "./follow-up-board.js";
export { AI_CHAT_RESUMED_EVENT, chatAiOf, resumeChat, setChatMode } from "./chat-state.js";
export { aiOverviewOf, chatsAnsweredSince } from "./overview.js";
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
export { keptTrace, keptTraces, type KeptTrace } from "./traces/trace-reads.js";
export { createTraceSink, forgetTraces, TRACE_DAYS, tracesDue } from "./traces/trace-sink.js";
export * from "./natural/index.js";
export * from "./one/index.js";
