// A stand-in for fetch that answers with a real tRPC router, so the client links are tested against the real wire
// format (batches, jsonl streams, error shapes), and records what the browser sent.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { AnyRouter } from "@trpc/server";
import { vi } from "vitest";

export interface Sent {
  url: string;
  method: string;
  contentType: string | null;
  streamHeader: string | null;
  body: unknown;
}

export function stubApi(router: AnyRouter, endpoint: string): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : undefined;
      sent.push({
        url: url.pathname + url.search,
        method: init?.method ?? "GET",
        contentType: headers.get("content-type"),
        streamHeader: headers.get("trpc-accept"),
        body: body === undefined ? null : JSON.parse(body),
      });
      const request = new Request(url, {
        method: init?.method ?? "GET",
        headers,
        body: body ?? null,
        signal: init?.signal ?? null,
      });
      return fetchRequestHandler({
        endpoint,
        req: request,
        router,
        createContext: () => ({}),
        allowMethodOverride: true,
      });
    }),
  );
  return sent;
}
