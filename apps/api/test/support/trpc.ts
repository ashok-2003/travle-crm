// Calls tRPC procedures through the HTTP app the way the web app's client does: queries are GETs with the input in
// the URL, mutations are JSON POSTs from the trusted origin.
import type { CookieJar } from "./cookie-jar.js";
import { ORIGIN, type TestServer } from "./test-server.js";

export async function query(server: TestServer, path: string, jar?: CookieJar, input?: unknown): Promise<Response> {
  const search = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return server.app.request(`/api/trpc/${path}${search}`, { headers: jar ? { cookie: jar.header } : {} });
}

export async function mutate(server: TestServer, path: string, input: unknown, jar?: CookieJar): Promise<Response> {
  return server.app.request(`/api/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(jar ? { cookie: jar.header } : {}) },
    body: JSON.stringify(input),
  });
}

/** The data of a successful call. Fails the test, showing the error, if the call failed. */
export async function dataOf<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { result?: { data: T }; error?: unknown };
  if (!response.ok || !body.result)
    throw new Error(`Expected success, got ${String(response.status)}: ${JSON.stringify(body.error)}`);
  return body.result.data;
}

/** The HTTP status and domain reason of a failed call, e.g. { status: 403, reason: "MISSING_PERMISSION" }. */
export async function refusalOf(response: Response): Promise<{ status: number; reason: string | null }> {
  const body = (await response.json()) as { error?: { data?: { reason?: string | null } } };
  return { status: response.status, reason: body.error?.data?.reason ?? null };
}
