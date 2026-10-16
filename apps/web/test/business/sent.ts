// What the app sent the api, read from the fetch the api stub stands in for (test/support/api-stub.ts): every input a
// procedure was called with, in the order sent, batched calls included. A mutation's inputs are in its body, a
// query's in its address.
import { vi } from "vitest";

export function inputsSentTo(path: string): unknown[] {
  return vi.mocked(fetch).mock.calls.flatMap(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const paths = decodeURIComponent(url.pathname.replace(/^\/api\/trpc\//, "")).split(",");
    const position = paths.indexOf(path);
    const sent = typeof init?.body === "string" ? init.body : url.searchParams.get("input");
    if (position === -1 || sent === null) return [];
    const inputs = JSON.parse(sent) as Record<string, unknown>;
    return [inputs[String(position)]];
  });
}
