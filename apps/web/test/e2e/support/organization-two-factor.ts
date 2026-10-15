// Two-factor sign-in for the settings journeys: turns it on for the signed-in person through Better Auth's endpoints,
// with the code an authenticator app would show.
import type { APIRequestContext } from "@playwright/test";
import { expect } from "./fixtures";
import { secretOf, totpCode } from "./totp";

/** Turns two-factor on for whoever `request` is signed in as. Returns the secret, for later codes. */
export async function turnOnTwoFactor(request: APIRequestContext, password: string): Promise<string> {
  const headers = { origin: process.env.E2E_BASE_URL ?? "" };
  const enabled = await request.post("/api/auth/two-factor/enable", { data: { password }, headers });
  expect(enabled.status()).toBe(200);
  const { totpURI } = (await enabled.json()) as { totpURI: string };
  const secret = secretOf(totpURI);
  const verified = await request.post("/api/auth/two-factor/verify-totp", {
    data: { code: totpCode(secret) },
    headers,
  });
  expect(verified.status()).toBe(200);
  return secret;
}
