// What the app sent the stubbed api (support/api-stub.ts): each call's input to one procedure, in order, read from the
// fetch the stub stands in for. tRPC batches calls: "/api/trpc/a,b" with the inputs by position, { "0": …, "1": … },
// in the body of a POST (mutations) or the `input` parameter of a GET (queries).
import { vi } from "vitest";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

const API_TRPC = "/api/trpc/";

export function inputsSentTo(path: string): unknown[] {
  const calls = vi.mocked(fetch).mock.calls as FetchCall[];
  return calls.flatMap(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    if (!url.pathname.startsWith(API_TRPC)) return [];
    const paths = decodeURIComponent(url.pathname.slice(API_TRPC.length)).split(",");
    const sent = init?.method === "POST" ? init.body : url.searchParams.get("input");
    const inputs = JSON.parse(typeof sent === "string" ? sent : "{}") as Record<string, unknown>;
    return paths.flatMap((called, position) => (called === path ? [inputs[String(position)]] : []));
  });
}
