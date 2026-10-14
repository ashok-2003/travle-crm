// The tRPC context: who sent the request, read from the session cookie (the 5-minute cache, spec 6.4).
import type { Identity } from "@travel-crm/domain/identity";

export interface ApiDependencies {
  identity: Identity;
}

export async function createContext({ identity }: ApiDependencies, request: Request) {
  const signedIn = await identity.auth.api.getSession({ headers: request.headers });
  return {
    identity,
    headers: request.headers,
    session: signedIn?.session ?? null,
    user: signedIn?.user ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
