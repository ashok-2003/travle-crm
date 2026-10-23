// Public API of @travel-crm/integrations/secret-box: sealing a secret for storage, bound to where it is kept (ADR 0034).
export { createAesSecretBox, generateSecretBoxKey } from "./aes-secret-box.js";
export { createMemorySecretBox } from "./memory-secret-box.js";
export {
  type SealedSecret,
  type SecretBox,
  SecretBoxError,
  type SecretBoxErrorReason,
  secretBoxErrorReasons,
} from "./secret-box.js";
