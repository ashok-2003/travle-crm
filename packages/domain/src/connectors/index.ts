// Public API of the connectors module (release D): website forms and lead links, API keys, outgoing webhooks, and
// connections to other services (Meta lead ads, IndiaMART), each bringing leads in through crm's one way in.
export { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "./api-keys.js";
export { apiAddLead, apiListLeads, type ApiLead } from "./api-leads.js";
export { leadgenNotices, metaLeadsProvider } from "./meta-provider.js";
export {
  createCapture,
  findCapture,
  listCaptures,
  receiveCaptureLead,
  setCaptureDisabled,
  updateForm,
} from "./captures.js";
export {
  checkIndiaMart,
  connectIndiaMart,
  connectionOrganization,
  connectionsToCheck,
  connectMetaPage,
  disconnect,
  leadOfMeta,
  listConnections,
  receiveMetaLead,
  type IndiaMartDependencies,
  type MetaDependencies,
} from "./connections.js";
export { intakeContextFor, takeLead, type IntakeDependencies, type IntakePeople } from "./intake.js";
export { createSecretBox, requireBox, type SecretBox } from "./secret-box.js";
export type { ConnectorServices } from "./services.js";
export {
  createWebhook,
  deliverWebhook,
  listDeliveries,
  listWebhooks,
  setWebhookDisabled,
  WEBHOOK_ATTEMPTS,
  WEBHOOK_DELIVERY_QUEUE,
  webhookListeners,
  webhookSignature,
} from "./webhooks.js";
