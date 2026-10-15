// The tRPC context: who sent the request, read from the session cookie (the 5-minute cache, spec 6.4), and the
// services the procedures run on.
import type { Database } from "@travel-crm/db";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { Profiles } from "@travel-crm/domain/profile";
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
}

/**
 * `resHeaders` are the response's headers: Better Auth re-issues its cookies while reading the session (a fresh cache
 * cookie, a longer expiry), and those Set-Cookie headers must reach the browser.
 */
export async function createContext(
  { identity, subscriptions, profiles, db, files, pushPublicKey }: ApiDependencies,
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
