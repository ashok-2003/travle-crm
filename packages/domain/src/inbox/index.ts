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
  WHATSAPP_PROVIDER,
  type InboxDependencies,
} from "./dependencies.js";
export { addDemoWhatsApp } from "./demo-seed.js";
export { withdrawWhatsApp, type WhatsAppWithdrawn } from "./erasure.js";
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
  visibleMessage,
} from "./views.js";
