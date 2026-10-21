// Credentials another service gave an agency (a page token, a CRM key, a WhatsApp token), sealed with AES-256-GCM under
// INTEGRATION_SECRETS_KEY before they are stored, and opened only to call that service. A changed or wrong key opens
// nothing: the connection then needs connecting again.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DomainError } from "../kernel/index.js";

export interface SecretBox {
  seal(plain: string): string;
  open(sealed: string): string;
}

const VERSION = "v1";

/** A box with a key of 32 bytes in base64; throws a RangeError for any other key. */
export function createSecretBox(keyBase64: string): SecretBox {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new RangeError("INTEGRATION_SECRETS_KEY must be 32 bytes in base64");
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const sealed = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return [
        VERSION,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        sealed.toString("base64url"),
      ].join(".");
    },
    open(sealed) {
      const [version, iv, tag, body] = sealed.split(".");
      if (version !== VERSION || iv === undefined || tag === undefined || body === undefined) {
        throw new DomainError("CONFLICT", "CONNECTION_NEEDS_RECONNECTING", "Connect this service again");
      }
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
      } catch {
        throw new DomainError("CONFLICT", "CONNECTION_NEEDS_RECONNECTING", "Connect this service again");
      }
    },
  };
}

/** The box, or the refusal a person sees while the platform hasn't set INTEGRATION_SECRETS_KEY. */
export function requireBox(box: SecretBox | null): SecretBox {
  if (box === null) {
    throw new DomainError("CONFLICT", "INTEGRATIONS_NOT_SET_UP", "Connections to other services aren't set up yet");
  }
  return box;
}
