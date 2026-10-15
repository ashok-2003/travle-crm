// The console's tRPC context: who is signed in, read from the database on every request (everything the console does
// is sensitive, spec 6.4), and the services the console runs on.
import type { PlatformServices } from "@travel-crm/domain/platform";
import { forwardCookies } from "../context.js";

export async function createPlatformContext(services: PlatformServices, request: Request, resHeaders: Headers) {
  const { headers, response } = await services.identity.auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  forwardCookies(headers, resHeaders);
  return {
    services,
    headers: request.headers,
    resHeaders,
    session: response?.session ?? null,
    user: response?.user ?? null,
  };
}

export type PlatformContext = Awaited<ReturnType<typeof createPlatformContext>>;
