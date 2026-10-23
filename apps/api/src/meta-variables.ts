// What the Meta settings must look like (ADR 0034): the five names and two checks, apart from the environment so that the
// environment's schema can use them without a cycle.

/** The names of the five settings, which come all together or not at all. */
export const META_VARIABLES = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_LOGIN_CONFIG_ID",
  "META_TOKEN_KEY",
] as const;

/** A key a person typed or copied from an example is no key: too short, or fewer than 10 different characters. */
export function metaVerifyTokenIsWeak(token: string): boolean {
  const trimmed = token.trim();
  return trimmed.length < 32 || new Set(trimmed).size < 10;
}

/** One key of META_TOKEN_KEY: base64 of exactly 32 bytes. */
export function isMetaTokenKey(key: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(key) && Buffer.from(key, "base64").byteLength === 32;
}
