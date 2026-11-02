// The webhook provider `brevo` (the failed-emails spec): Brevo's transactional webhook posts to /webhooks/brevo/<token>
// with `Authorization: Bearer <key>`. Brevo signs nothing, so the path token and the bearer key are the credentials,
// both compared in constant time; without both, a bare 401 and nothing stored. Everything that carries them is stored
// and answered 200, whatever the body says: `identify` never returns null. The worker's `process` marks the emails
// Brevo reports dropping failed, by the X-Mailin-custom reference we sent on each; every other event changes nothing.
// The stored payload names the recipient: the console's email-log purge blanks it after 7 days.
import { createHash } from "node:crypto";
import type { Database } from "@travel-crm/db";
import { BREVO_PROVIDER, recordProviderFailures, type ProviderFailure } from "@travel-crm/domain/email-log";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import type { Environment } from "./environment.js";
import { PATH_TOKEN_HEADER, sameSecret } from "./webhook-route.js";

/** Brevo's events that mean the email never reached its recipient (the owner, 2026-11-02). */
export const BREVO_FAILURE_EVENTS: ReadonlySet<string> = new Set([
  "hard_bounce",
  "soft_bounce",
  "blocked",
  "spam",
  "invalid_email",
  "error",
]);

export interface BrevoWebhookSettings {
  /** The webhook URL's last path segment. */
  webhookToken: string;
  /** The bearer token Brevo's webhook sends. */
  webhookKey: string;
}

/** The settings, or null when Brevo's reports are off (environment.ts has already refused one without the other). */
export function brevoSettingsOf(environment: Environment): BrevoWebhookSettings | null {
  const { BREVO_WEBHOOK_TOKEN: webhookToken, BREVO_WEBHOOK_KEY: webhookKey } = environment;
  return webhookToken === undefined || webhookKey === undefined ? null : { webhookToken, webhookKey };
}

/** One of Brevo's events, as far as we read it. */
export interface BrevoEvent {
  event: string;
  messageId: string | null;
  /** The X-Mailin-custom header we sent, as Brevo hands it back. */
  reference: string | null;
  reason: string | null;
  /** When Brevo says it happened, if it says. */
  at: Date | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** ts_epoch is in milliseconds; read as seconds when it is too small to be (before 2001). ts is in seconds. */
function timeOf(event: Record<string, unknown>): Date | null {
  const epoch = count(event.ts_epoch);
  if (epoch !== null) return new Date(epoch < 1e12 ? epoch * 1000 : epoch);
  const seconds = count(event.ts);
  return seconds === null ? null : new Date(seconds * 1000);
}

/** The events in a body: one, or a batch; none from a body that is neither, or an item that names no event. */
export function brevoEventsOf(rawBody: string): BrevoEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return [];
  }
  const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  return items.flatMap((item): BrevoEvent[] => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const event = item as Record<string, unknown>;
    const name = text(event.event);
    if (name === null || !/^[a-z_]{1,40}$/.test(name)) return [];
    return [
      {
        event: name,
        messageId: text(event["message-id"]),
        reference: text(event["X-Mailin-custom"]),
        reason: text(event.reason),
        at: timeOf(event),
      },
    ];
  });
}

/** The bearer token in an Authorization header, or null. */
function bearerOf(header: string | null): string | null {
  return /^Bearer (\S+)$/.exec(header ?? "")?.[1] ?? null;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function brevoWebhookProvider(options: { settings: BrevoWebhookSettings; db: Database }): WebhookProvider {
  const { settings, db } = options;
  return {
    name: BREVO_PROVIDER,
    keptHeaders: [],
    verify: ({ headers }) =>
      // Both are always compared, so the time taken does not say which one was wrong.
      [
        sameSecret(headers.get(PATH_TOKEN_HEADER), settings.webhookToken),
        sameSecret(bearerOf(headers.get("authorization")), settings.webhookKey),
      ].every(Boolean),
    identify: ({ rawBody }) => {
      const events = brevoEventsOf(rawBody);
      const [first] = events;
      // An event is its message, kind and time; a delivery of the same events again is the same, however written.
      const identity = events.map((event) => JSON.stringify([event.messageId, event.event, event.at?.getTime()]));
      return {
        eventId: sha256(events.length === 0 ? rawBody : identity.join("\n")),
        eventType: first === undefined ? "brevo.unknown" : events.length > 1 ? "brevo.batch" : `brevo.${first.event}`,
      };
    },
    process: async (stored) => {
      const failures = brevoEventsOf(stored.payload).flatMap((event): ProviderFailure[] =>
        BREVO_FAILURE_EVENTS.has(event.event) && event.reference !== null
          ? [{ reference: event.reference, code: event.event, reason: event.reason, at: event.at ?? stored.receivedAt }]
          : [],
      );
      await recordProviderFailures(db, failures);
    },
  };
}
