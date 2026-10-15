// The 6-digit code an authenticator app shows (RFC 6238: HMAC-SHA1 over 30-second steps), for journeys that sign
// in with two-factor. The secret is the base32 text in the otpauth:// link.
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Bytes(text: string): Buffer {
  let bits = "";
  for (const character of text.replace(/=+$/, "").toUpperCase()) {
    const value = BASE32.indexOf(character);
    if (value < 0) throw new Error(`Not base32: ${character}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

export function totpCode(base32Secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", base32Bytes(base32Secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

/** The secret in an otpauth:// link. */
export function secretOf(totpUri: string): string {
  const secret = new URL(totpUri).searchParams.get("secret");
  if (!secret) throw new Error("no secret in the link");
  return secret;
}
