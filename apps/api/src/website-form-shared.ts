// What the website form's public routes share: their dependencies, and how a refusal is answered (spec 5.1, 6.5).
import type { Database } from "@travel-crm/db";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import type { Profiles } from "@travel-crm/domain/profile";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import type { BotCheck } from "@travel-crm/integrations/bot-check";
import type { Logger } from "@travel-crm/integrations/logging";
import type { Context } from "hono";
import type { FormAddressSettings } from "./form-client-address.js";
import { requestOf, type RequestLogEnv } from "./request-log.js";

/** The bot check and the public key of its widget, together: one without the other cannot be expressed (W39). */
export interface Turnstile {
  botCheck: BotCheck;
  siteKey: string;
}

export interface WebsiteFormRouteDependencies {
  db: Database;
  identity: Identity;
  profiles: Profiles;
  files: Files;
  limiter: RateLimiter;
  /** Null when the server has no Turnstile keys: nothing is checked and the page shows no widget. */
  turnstile: Turnstile | null;
  /** The auth secret the opened token's key is derived from (W37); no new secret to set. */
  authSecret: string;
  /** How the visitor's address is read (W32) and reported (W33). */
  address: FormAddressSettings;
  logger: Logger;
  now?: () => Date;
}

const STATUS_OF_CODE = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  LIMIT_REACHED: 403,
  FEATURE_LOCKED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

type Handled = Context<RequestLogEnv>;

/** Tells the request's log line which agency the call was for (an id, never the key). */
export function noteOrganization(c: Handled, organizationId: string): void {
  const request = requestOf(c);
  if (request !== undefined) request.organizationId = organizationId;
}

/** A refusal as the page reads it: `{ code, reason, message }`, the reason's status, and the log line's refusal. */
export function refusal(c: Handled, error: DomainError) {
  const request = requestOf(c);
  if (request !== undefined) request.refusal = { code: error.code, reason: error.reason };
  return c.json({ code: error.code, reason: error.reason, message: error.message }, STATUS_OF_CODE[error.code]);
}

export const tooManyTries = (c: Handled, retryAfterSeconds: number) => {
  const request = requestOf(c);
  if (request !== undefined) request.refusal = { code: "RATE_LIMITED", reason: "RATE_LIMITED" };
  c.header("Retry-After", String(retryAfterSeconds));
  return c.json(
    { code: "RATE_LIMITED", reason: "RATE_LIMITED", message: "Too many tries. Please wait a few minutes." },
    429,
  );
};

export const formNotFound = () => new DomainError("NOT_FOUND", "FORM_NOT_FOUND", "No such form");
