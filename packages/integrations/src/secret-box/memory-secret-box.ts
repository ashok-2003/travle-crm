// An in-memory SecretBox for the domain's and the api's tests: the real cipher under a key made for the one box.
import { createAesSecretBox, generateSecretBoxKey } from "./aes-secret-box.js";
import type { SecretBox } from "./secret-box.js";

export function createMemorySecretBox(): SecretBox {
  return createAesSecretBox([generateSecretBoxKey()]);
}
