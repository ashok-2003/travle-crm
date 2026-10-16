// What the app sent with each call to one procedure, in call order, for tests whose api is support/api-stub.ts: read
// from the fetch stub's calls, a query's input from ?input= and a mutation's from its body, both batched by index as
// tRPC's httpBatchLink sends them.
import { vi } from "vitest";

const API_TRPC = "/api/trpc/";

export function sentInputs(path: string): unknown[] {
  const inputs: unknown[] = [];
  for (const [input, init] of vi.mocked(fetch).mock.calls) {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    if (!url.pathname.startsWith(API_TRPC)) continue;
    const paths = decodeURIComponent(url.pathname.slice(API_TRPC.length)).split(",");
    const body = typeof init?.body === "string" ? init.body : (url.searchParams.get("input") ?? "{}");
    const batch = JSON.parse(body) as Record<string, unknown>;
    paths.forEach((each, index) => {
      if (each === path) inputs.push(batch[String(index)]);
    });
  }
  return inputs;
}
