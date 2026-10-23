// The Meta lead ads' settings (ADR 0034, spec 13): the five variables the environment holds, read as one value, or none
// when Meta is off. Nothing in an error or a log ever holds a part of a value: three of them are secrets.
import type { Environment } from "./environment.js";

export interface MetaSettings {
  appId: string;
  /** Signs webhooks, exchanges logins and verifies the deletion callback. */
  appSecret: string;
  webhookVerifyToken: string;
  loginConfigId: string;
  /** Newest first: new Page tokens are sealed with the first, any opens (M1). */
  tokenKeys: readonly string[];
  /** The journeys' fake Graph (development and tests only; refused in production). */
  graphTestServerUrl: string | null;
}

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

/** The settings, or null when Meta is off (environment.ts has already refused a half-set group). */
export function metaSettingsOf(environment: Environment): MetaSettings | null {
  const { META_APP_ID: appId, META_APP_SECRET: appSecret, META_WEBHOOK_VERIFY_TOKEN: verifyToken } = environment;
  const { META_LOGIN_CONFIG_ID: loginConfigId, META_TOKEN_KEY: tokenKeys } = environment;
  if (
    appId === undefined ||
    appSecret === undefined ||
    verifyToken === undefined ||
    loginConfigId === undefined ||
    tokenKeys === undefined
  ) {
    return null;
  }
  return {
    appId,
    appSecret,
    webhookVerifyToken: verifyToken,
    loginConfigId,
    tokenKeys,
    graphTestServerUrl: environment.META_GRAPH_TEST_SERVER_URL ?? null,
  };
}

/** The start-up line for the api and the worker: on or off, and nothing of the values. */
export function metaStartUpLine(settings: MetaSettings | null): string {
  return settings === null ? "Meta lead ads: not set up" : "Meta lead ads: on";
}
