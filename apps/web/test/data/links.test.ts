// The api links: queries stream in one batch with a time limit, mutations batch without one, page visits go alone,
// and a refusal inside a streamed batch is still read as a refusal (a 401 signs out, a pending step redirects).
import { createTRPCClient } from "@trpc/client";
import { initTRPC, TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { refusalOf } from "@/data/api-error";
import { apiLinks, QUERY_TIMEOUT_MS } from "@/data/links";
import { stubApi } from "./support/fake-api";

const t = initTRPC.create();
const router = t.router({
  first: t.procedure.input(z.object({ phone: z.string() })).query(({ input }) => `first ${input.phone}`),
  second: t.procedure.query(() => "second"),
  signedOut: t.procedure.query(() => {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }),
  change: t.procedure.mutation(() => "changed"),
  usage: t.router({ track: t.procedure.mutation(() => "tracked") }),
});
const client = () => createTRPCClient<typeof router>({ links: apiLinks("/api/trpc") });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiLinks", () => {
  it("sends two queries of one tick as one streamed POST with their inputs in the body", async () => {
    const sent = stubApi(router, "/api/trpc");
    const api = client();
    const answers = await Promise.all([api.first.query({ phone: "98765 43210" }), api.second.query()]);
    expect(answers).toEqual(["first 98765 43210", "second"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      method: "POST",
      url: "/api/trpc/first,second?batch=1",
      streamHeader: "application/jsonl",
      contentType: "application/json",
      body: { 0: { phone: "98765 43210" } },
    });
    expect(sent[0]?.url).not.toMatch(/98765/);
  });

  it("sends a mutation as a plain POST, not streamed", async () => {
    const sent = stubApi(router, "/api/trpc");
    expect(await client().change.mutate()).toBe("changed");
    expect(sent).toMatchObject([{ method: "POST", url: "/api/trpc/change?batch=1", streamHeader: null }]);
  });

  it("sends a page visit on its own, even beside another mutation", async () => {
    const sent = stubApi(router, "/api/trpc");
    const api = client();
    await Promise.all([api.usage.track.mutate(), api.change.mutate()]);
    expect(sent.map((call) => call.url).sort()).toEqual(["/api/trpc/change?batch=1", "/api/trpc/usage.track"]);
  });

  it("gives a query a time limit of 30 seconds and ends it when that passes", async () => {
    const limit = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(limit.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            const fail = () => {
              reject(new Error("aborted"));
            };
            if (signal?.aborted) fail();
            signal?.addEventListener("abort", fail);
          }),
      ),
    );
    const pending = client().second.query();
    const outcome = expect(pending).rejects.toBeDefined();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    limit.abort(new DOMException("The operation timed out.", "TimeoutError"));
    await outcome;
    expect(timeout).toHaveBeenCalledWith(QUERY_TIMEOUT_MS);
    expect(QUERY_TIMEOUT_MS).toBe(30_000);
  });

  it("never times a mutation out", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    stubApi(router, "/api/trpc");
    await client().change.mutate();
    expect(timeout).not.toHaveBeenCalled();
  });

  it("keeps a streamed refusal readable beside the data of another query", async () => {
    stubApi(router, "/api/trpc");
    const api = client();
    const [refused, answered] = await Promise.allSettled([api.signedOut.query(), api.second.query()]);
    expect(answered).toEqual({ status: "fulfilled", value: "second" });
    expect(refused.status).toBe("rejected");
    expect(refusalOf(refused.status === "rejected" ? refused.reason : null)?.status).toBe(401);
  });
});
