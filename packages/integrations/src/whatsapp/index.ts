// Public API of @travel-crm/integrations/whatsapp: the WhatsApp provider port, its adapters, the webhook parser and the
// signer tests use to build MSG91's calls (ADR 0035).
export * from "./whatsapp-provider.js";
export * from "./parsed-event.js";
export { customerNumberOf, parseMsg91Event } from "./parse-msg91-event.js";
export { createMemoryWhatsAppProvider, type MemoryWhatsAppProvider, type SentMessage } from "./memory-whatsapp.js";
export {
  inboundBody,
  msg91Signer,
  statusBody,
  type InboundBodyInput,
  type Msg91SignerOptions,
  type StatusBodyInput,
} from "./signer.js";
