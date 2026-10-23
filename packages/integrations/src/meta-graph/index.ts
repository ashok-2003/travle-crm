// Public API of @travel-crm/integrations/meta-graph: the Meta Graph port, its adapters and Meta's signed values (ADR 0034).
export {
  type ListLeadsOptions,
  META_GRAPH_VERSION,
  type MetaFormDescription,
  type MetaFormQuestion,
  type MetaFormSummary,
  type MetaGraph,
  MetaGraphError,
  type MetaGraphErrorReason,
  metaGraphErrorReasons,
  metaGraphMethods,
  type MetaLead,
  type MetaLeadPlatform,
  type MetaLoginResult,
  type MetaPage,
  type MetaPageGrant,
  type MetaQuestionType,
  metaQuestionTypes,
  type MetaTokenInspection,
} from "./meta-graph.js";
export { createMemoryMetaGraph, type MemoryLeadInput, type MemoryMetaGraph } from "./memory-meta-graph.js";
export {
  type LeadgenChange,
  leadgenDeliveryBody,
  makeSignedRequest,
  readSignedRequest,
  type SignedRequestPayload,
  signWebhookBody,
  WEBHOOK_SIGNATURE_PREFIX,
  webhookSigner,
} from "./signing.js";
export { createRealMetaGraph, type RealMetaGraphOptions } from "./real-meta-graph.js";
export { mapMetaError } from "./meta-responses.js";
