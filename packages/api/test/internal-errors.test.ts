// Unexpected errors reach the client as "Something went wrong": no message from the cause, and no stack trace.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { describe, expect, it, vi } from "vitest";
import type { Context } from "../src/context.js";
import { router, t } from "../src/trpc.js";

const failing = router({
  boom: t.procedure.query(() => {
    throw new Error('relation "user" does not exist at /Users/ak/travel-crm/secret.ts');
  }),
});

describe("internal errors over HTTP", () => {
  it("send neither the cause's message nor a stack trace", async () => {
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request("http://localhost/trpc/boom"),
      router: failing,
      createContext: () => ({}) as Context,
      onError: vi.fn(),
    });
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({
      error: { message: "Something went wrong", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } },
    });
    expect(text).not.toContain("relation");
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain("stack");
  });
});
