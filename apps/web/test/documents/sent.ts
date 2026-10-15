// What the app sent the stubbed api (support/api-stub.ts): each call's input to one procedure, in order, read from the
// fetch the stub stands in for. Mutations are batched POSTs whose body is { "0": input }.
import { vi } from "vitest";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

export function inputsSentTo(path: string): unknown[] {
  const calls = vi.mocked(fetch).mock.calls as FetchCall[];
  return calls
    .filter(([input]) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
      return decodeURIComponent(url.pathname) === `/api/trpc/${path}`;
    })
    .map(([, init]) => (JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>)["0"]);
}
