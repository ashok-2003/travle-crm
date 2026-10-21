// The tRPC context: who sent the request, read from the session cookie (the 5-minute cache, spec 6.4), and the
// services the procedures run on.
import type { Database } from "@travel-crm/db";
import type { ConnectorServices } from "@travel-crm/domain/connectors";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { AddGuard } from "@travel-crm/domain/imports";
import type { Profiles } from "@travel-crm/domain/profile";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import type { SheetsDependencies } from "@travel-crm/domain/sheets";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";

export interface ApiDependencies {
  identity: Identity;
  /** What each organization may use today: request checks 2 and 3. */
  subscriptions: SubscriptionAccess;
  /** The organization's business profile (spec 7.1). */
  profiles: Profiles;
  /** The organization's data, inside db.forOrg(): notifications, documents, share links, the audit log. */
  db: Database;
  /** Presigned uploads and downloads, and attachments on any record (spec 9.2). */
  files: Files;
  /**
   * The VAPID public key the browser subscribes to push with, from the environment: the web app asks for it
   * (notifications.push.publicKey), so one build serves every environment.
   */
  pushPublicKey: string;
  /**
   * Checks the Add of a lead import runs in its own transaction (a Google Sheet's check that is saving refuses it,
   * S26). None unless the server passes some.
   */
  addGuards?: readonly AddGuard[];
  /** Reads Google Sheets, read only (ADR 0031); null or absent when no service account is set: Google Sheets is off. */
  google?: SheetsDependencies["google"];
  /** Counts how often an organization makes us read Google by hand (SD4); none counts nothing. */
  rateLimiter?: Pick<RateLimiter, "hit">;
  /** Keys the spreadsheet claim; null or absent when SHEETS_HASH_KEY is not set. */
  sheetsHashes?: SheetsDependencies["hashes"];
  /** Forms, keys, webhooks and connections to other services (release D); null or absent: connecting is off. */
  connectors?: ConnectorServices | null;
}

/**
 * `resHeaders` are the response's headers: Better Auth re-issues its cookies while reading the session (a fresh cache
 * cookie, a longer expiry), and those Set-Cookie headers must reach the browser.
 */
export async function createContext(
  {
    identity,
    subscriptions,
    profiles,
    db,
    files,
    pushPublicKey,
    addGuards = [],
    google = null,
    sheetsHashes = null,
    rateLimiter,
    connectors = null,
  }: ApiDependencies,
  request: Request,
  resHeaders: Headers,
) {
  const { headers, response } = await identity.auth.api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });
  forwardCookies(headers, resHeaders);
  return {
    identity,
    subscriptions,
    profiles,
    db,
    files,
    pushPublicKey,
    addGuards,
    google,
    sheetsHashes,
    rateLimiter,
    connectors,
    headers: request.headers,
    resHeaders,
    session: response?.session ?? null,
    user: response?.user ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

/** Copies every Set-Cookie header, which Headers.append keeps apart. */
export function forwardCookies(from: Headers, to: Headers): void {
  for (const cookie of from.getSetCookie()) to.append("set-cookie", cookie);
}
