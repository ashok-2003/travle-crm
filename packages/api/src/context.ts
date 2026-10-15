// The tRPC context: who sent the request, read from the session cookie (the 5-minute cache, spec 6.4).
import type { Identity } from "@travel-crm/domain/identity";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";

export interface ApiDependencies {
  identity: Identity;
  /** What each organization may use today: request checks 2 and 3. */
  subscriptions: SubscriptionAccess;
}

/**
 * `resHeaders` are the response's headers: Better Auth re-issues its cookies while reading the session (a fresh cache
 * cookie, a longer expiry), and those Set-Cookie headers must reach the browser.
 */
export async function createContext(
  { identity, subscriptions }: ApiDependencies,
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
