// What the app sent the api, read from the fetch the api stub stands in for (test/support/api-stub.ts): every input a
// procedure was called with, in the order sent, batched calls included.
import { vi } from "vitest";

export function inputsSentTo(path: string): unknown[] {
  return vi.mocked(fetch).mock.calls.flatMap(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const paths = decodeURIComponent(url.pathname.replace(/^\/api\/trpc\//, "")).split(",");
    const position = paths.indexOf(path);
    if (position === -1 || typeof init?.body !== "string") return [];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    return [body[String(position)]];
  });
}
