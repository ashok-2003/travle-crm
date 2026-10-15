// Two-factor sign-in for the settings journeys: turn it on for the signed-in person through Better Auth's endpoints,
// with codes an authenticator app would show (RFC 6238: HMAC-SHA1 over 30-second steps, 6 digits).
import { createHmac } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { expect } from "./fixtures";

/** RFC 4648 base32, as otpauth:// links carry the secret. */
function base32Bytes(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of text.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** The code an authenticator app shows now for a base32 secret. */
export function authenticatorCode(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", base32Bytes(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String(digest.readUInt32BE(offset) & 0x7fffffff)
    .slice(-6)
    .padStart(6, "0");
}

/** Turns two-factor on for whoever `request` is signed in as. Returns the secret, for later codes. */
export async function turnOnTwoFactor(request: APIRequestContext, password: string): Promise<string> {
  const headers = { origin: process.env.E2E_BASE_URL ?? "" };
  const enabled = await request.post("/api/auth/two-factor/enable", { data: { password }, headers });
  expect(enabled.status()).toBe(200);
  const { totpURI } = (await enabled.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  const verified = await request.post("/api/auth/two-factor/verify-totp", {
    data: { code: authenticatorCode(secret) },
    headers,
  });
  expect(verified.status()).toBe(200);
  return secret;
}
