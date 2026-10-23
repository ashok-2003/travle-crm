// AES-256-GCM SecretBox from node:crypto. Keys are base64 of 32 random bytes, newest first (META_TOKEN_KEY, spec M1).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { type SealedSecret, SecretBoxError, type SecretBox } from "./secret-box.js";

const keyBytes = 32;
const nonceBytes = 12;
const tagBytes = 16;

interface Key {
  version: number;
  bytes: Buffer;
}

/** The first four bytes of the key's SHA-256, as a signed 32-bit integer (fits the INTEGER column). */
function versionOf(bytes: Buffer): number {
  return createHash("sha256").update(bytes).digest().readInt32BE(0);
}

function readKey(base64: string): Key {
  const bytes = Buffer.from(base64.trim(), "base64");
  if (bytes.byteLength !== keyBytes) throw new SecretBoxError("bad_key");
  return { version: versionOf(bytes), bytes };
}

/** `keys` are base64 strings of 32 bytes, newest first: new seals use the first, any of them opens. */
export function createAesSecretBox(keys: readonly string[]): SecretBox {
  const parsed = keys.map(readKey);
  const newest = parsed[0];
  if (!newest) throw new SecretBoxError("bad_key");

  return {
    seal(secret, context) {
      const nonce = randomBytes(nonceBytes);
      const cipher = createCipheriv("aes-256-gcm", newest.bytes, nonce);
      cipher.setAAD(Buffer.from(context, "utf8"));
      const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
      const ciphertext = Buffer.concat([body, cipher.getAuthTag()]);
      return { ciphertext: new Uint8Array(ciphertext), nonce: new Uint8Array(nonce), keyVersion: newest.version };
    },
    open(sealed: SealedSecret, context) {
      const key = parsed.find((candidate) => candidate.version === sealed.keyVersion);
      if (!key || sealed.ciphertext.byteLength < tagBytes || sealed.nonce.byteLength !== nonceBytes) {
        throw new SecretBoxError("cannot_open");
      }
      const data = Buffer.from(sealed.ciphertext);
      try {
        const decipher = createDecipheriv("aes-256-gcm", key.bytes, Buffer.from(sealed.nonce));
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(data.subarray(data.byteLength - tagBytes));
        const plain = Buffer.concat([decipher.update(data.subarray(0, data.byteLength - tagBytes)), decipher.final()]);
        return plain.toString("utf8");
      } catch {
        throw new SecretBoxError("cannot_open");
      }
    },
  };
}

/** A fresh key as the setting holds it (`openssl rand -base64 32`), for tests and docs. */
export function generateSecretBoxKey(): string {
  return randomBytes(keyBytes).toString("base64");
}
