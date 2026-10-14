// Two-factor sign-in for tests: turn it on through Better Auth's own endpoints and produce valid authenticator codes.
import { base32 } from "@better-auth/utils/base32";
import type { CookieJar } from "./cookie-jar.js";
import { postJson, type TestServer } from "./test-server.js";

export interface TwoFactorSetup {
  /** The otpauth:// link a phone would scan. */
  totpUri: string;
  /** The secret inside it, for generating codes. */
  secret: string;
}

/** Turns on two-factor for the signed-in person: asks for the setup link, then confirms it with a code. */
export async function enableTwoFactor(server: TestServer, jar: CookieJar, password: string): Promise<TwoFactorSetup> {
  const enable = jar.absorb(await postJson(server, "/api/auth/two-factor/enable", { password }, jar));
  if (!enable.ok) throw new Error(`two-factor enable failed with ${String(enable.status)}`);
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const encoded = new URL(totpURI).searchParams.get("secret") ?? "";
  const secret = new TextDecoder().decode(base32.decode(encoded));
  const verify = jar.absorb(
    await postJson(server, "/api/auth/two-factor/verify-totp", { code: await codeFor(server, secret) }, jar),
  );
  if (!verify.ok) throw new Error(`two-factor verify failed with ${String(verify.status)}`);
  return { totpUri: totpURI, secret };
}

/** The current authenticator code for a secret, as the person's phone would show it. */
export async function codeFor(server: TestServer, secret: string): Promise<string> {
  return (await server.identity.auth.api.generateTOTP({ body: { secret } })).code;
}
