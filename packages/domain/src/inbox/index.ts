// Public API of the inbox module: the WhatsApp inbox through MSG91 (spec 2026-10-23, ADR 0035, L2: above crm). It stores a
// customer's messages, turns a new number into a lead through crm, and shows the chats by the lead's own scope. The api, the
// worker and the console call it; nothing below calls it.
export { adoptAll, adoptChats } from "./adopt.js";
export { connectNumber, disconnectNumber, markConnected, pauseNumber, resumeNumber, setCaps } from "./connection.js";
export { connectionById, liveConnection, toConnectionRow, type ConnectionRow } from "./connection-row.js";
export {
  ADOPT_QUEUE,
  COPY_MEDIA_QUEUE,
  WHATSAPP_HEALTH_QUEUE,
  WHATSAPP_TEMPLATES_QUEUE,
  WHATSAPP_PROVIDER,
  type InboxDependencies,
} from "./dependencies.js";
export { addDemoWhatsApp } from "./demo-seed.js";
export { withdrawWhatsApp, type WhatsAppWithdrawn } from "./erasure.js";
export { mediaLinkOf, startLeadFromConversation } from "./chat-actions.js";
export {
  archiveConversation,
  markConversationRead,
  MAX_SNOOZE_MS,
  pinConversation,
  snoozeConversation,
  starMessage,
} from "./chat-flags.js";
export { unreadCounts, unreadIdsOf, UNREAD_FILTER_LIMIT } from "./unread.js";
export {
  automationCouldAct,
  automationOf,
  createKeywordReply,
  CUSTOMER_WROTE_EVENT,
  deleteKeywordReply,
  listKeywordReplies,
  saveAutomation,
} from "./automation.js";
export {
  answerAutomatically,
  AUTOMATION_COOLDOWN_MS,
  automationListener,
  isOpenAt,
  keywordAnswerFor,
  type AutomaticAnswer,
} from "./automation-answer.js";
export {
  askForBatch,
  BROADCAST_READY_EVENT,
  broadcastDetailOf,
  cancelBroadcast,
  createBroadcast,
  listBroadcasts,
  previewBroadcast,
  resumeBroadcast,
} from "./broadcast.js";
export { broadcastListener, nextMorning, sendBroadcastBatch } from "./broadcast-send.js";
export { addNote, listNotes, MENTION_KIND } from "./notes.js";
export {
  cancelScheduled,
  INBOX_DUE_WORK_QUEUE,
  listScheduled,
  runDueWork,
  runDueWorkFor,
  scheduleMessage,
  SNOOZE_KIND,
} from "./scheduled.js";
export { summaryOf } from "./summary.js";
export { createQuickReply, deleteQuickReply, listQuickReplies, updateQuickReply } from "./quick-replies.js";
export {
  confirmTripKitUpload,
  createTripKit,
  deleteTripKit,
  listTripKits,
  removeTripKitFile,
  requestTripKitUpload,
  updateTripKit,
  type TripKitDependencies,
} from "./trip-kits.js";
export { sendTripKit, sendTripKitOnKeyword, tripKitFor, tripKitKeywordListener } from "./trip-kit-send.js";
export { createTag, deleteTag, listTags, setConversationTags } from "./tags.js";
export { settleNeedsReply } from "./needs-reply.js";
export {
  kindOf,
  markAnswered,
  MESSAGE_QUEUED_EVENT,
  queueMedia,
  queueText,
  requestMediaUpload,
  type MediaDependencies,
  type ReplyContext,
} from "./outbox.js";
export {
  AGENCY_SENDS_PER_MINUTE,
  PLATFORM_SENDS_PER_MINUTE,
  sendMessageListener,
  sendQueued,
  type FailureCode,
  type SenderDependencies,
} from "./sender.js";
export { windowEndOf, windowIsOpen, WINDOW_MS } from "./window.js";
export { checkAllConnections, checkConnection } from "./health.js";
export { copyMedia, copyMediaJob, MAX_MEDIA_BYTES } from "./media.js";
export { messageNoticeListener, pastCustomerNoticeListener, type NoticeDependencies } from "./notices.js";
export { processWhatsAppBody } from "./process-event.js";
export { routeListener } from "./route-listener.js";
export {
  isNumberHeldElsewhere,
  noteUnrouted,
  removeRoute,
  routeCount,
  routeOfNumber,
  routesPage,
  unroutedNumbers,
  upsertRoute,
} from "./routes.js";
export { visibleConversations } from "./scope.js";
export { applyStatus } from "./statuses.js";
export { bumpUsage, monthStartOf, type UsageCounts } from "./usage.js";
export {
  conversationHeaderOf,
  inboxStatusOf,
  leadChatOf,
  listConversations,
  listMessages,
  visibleConversation,
  visibleMessage,
} from "./views.js";
export { retryMessage } from "./retry.js";
export {
  assertTemplateAllowed,
  queueCheckedTemplate,
  queueTemplate,
  renderTemplate,
  startChatForLead,
} from "./template-send.js";
export {
  archiveTemplate,
  createTemplate,
  editTemplate,
  listTemplates,
  syncAllTemplates,
  syncTemplates,
  type TemplateDependencies,
} from "./templates.js";
export { isOptOutText, recordWhatsappOptOut, whatsappConsentOf, type WhatsappConsent } from "./whatsapp-consent.js";
export { NEEDS_ATTENTION_KIND } from "./attention.js";
export { queueSystemText, type SystemSendResult } from "./system-send.js";
