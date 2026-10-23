// The WhatsApp settings (ADR 0035, spec 13): the three variables the environment holds, read as one value, or none when
// WhatsApp is off. Nothing in an error or a log ever holds a part of a value: all three are secrets.
import type { Environment } from "./environment.js";

export interface WhatsAppSettings {
  /** MSG91's account key, sent in the `authkey` header. */
  authKey: string;
  /** The webhook URL's last path segment. */
  webhookToken: string;
  /** The value of the static header MSG91's panel sends. */
  webhookKey: string;
  /** The journeys' fake MSG91 (development and tests only; refused in production). */
  testServerUrl: string | null;
}

/** The settings, or null when WhatsApp is off (environment.ts has already refused a half-set group). */
export function whatsappSettingsOf(environment: Environment): WhatsAppSettings | null {
  const { MSG91_AUTHKEY: authKey, MSG91_WEBHOOK_TOKEN: webhookToken, MSG91_WEBHOOK_KEY: webhookKey } = environment;
  if (authKey === undefined || webhookToken === undefined || webhookKey === undefined) return null;
  return { authKey, webhookToken, webhookKey, testServerUrl: environment.MSG91_TEST_SERVER_URL ?? null };
}

/** The start-up line for the api and the worker: on or off, and nothing of the values. */
export function whatsappStartUpLine(settings: WhatsAppSettings | null): string {
  return settings === null ? "WhatsApp: not set up" : "WhatsApp: on";
}
