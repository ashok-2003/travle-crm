// The api links: queries stream in one batch with a time limit, mutations batch without one, page visits go alone,
// and a refusal inside a streamed batch is still read as a refusal (a 401 signs out, a pending step redirects).
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { initTRPC, TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { isWorthRetrying, QueryTimeoutError, refusalOf } from "@/data/api-error";
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
  vi.useRealTimers();
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

  /** A fetch that never answers, but ends with the signal's reason when aborted. */
  function hangingFetch() {
    return vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const fail = () => {
            reject(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
          };
          if (signal?.aborted) fail();
          signal?.addEventListener("abort", fail);
        }),
    );
  }

  it("ends a query that gets no answer after 30 seconds, with an error that says it timed out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", hangingFetch());
    const outcome = client()
      .second.query()
      .then(
        () => null,
        (error: unknown) => error,
      );
    await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<never>).cause).toBeInstanceOf(QueryTimeoutError);
    expect(isWorthRetrying(error)).toBe(false);
    expect(QUERY_TIMEOUT_MS).toBe(30_000);
  });

  it("works without AbortSignal.any: queries answer, the limit holds, and a caller's abort aborts", async () => {
    vi.stubGlobal("AbortSignal", Object.assign(Object.create(AbortSignal) as object, { any: undefined }));
    expect((AbortSignal as { any?: unknown }).any).toBeUndefined();
    stubApi(router, "/api/trpc");
    expect(await client().second.query()).toBe("second");
    vi.unstubAllGlobals();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("AbortSignal", Object.assign(Object.create(AbortSignal) as object, { any: undefined }));
    vi.stubGlobal("fetch", hangingFetch());
    const timedOut = client()
      .second.query()
      .then(
        () => null,
        (error: unknown) => error,
      );
    await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS);
    expect(((await timedOut) as TRPCClientError<never>).cause).toBeInstanceOf(QueryTimeoutError);

    const caller = new AbortController();
    const aborted = client()
      .second.query(undefined, { signal: caller.signal })
      .then(
        () => null,
        (error: unknown) => error,
      );
    await vi.advanceTimersByTimeAsync(10);
    caller.abort();
    const error = await aborted;
    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<never>).cause).not.toBeInstanceOf(QueryTimeoutError);
  });

  it("gives a page-visit report the same limit", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", hangingFetch());
    const outcome = client()
      .usage.track.mutate()
      .then(
        () => null,
        (error: unknown) => error,
      );
    await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS);
    expect(((await outcome) as TRPCClientError<never>).cause).toBeInstanceOf(QueryTimeoutError);
  });

  it("never times another mutation out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    void client()
      .change.mutate()
      .catch(() => undefined)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS * 10);
    expect(settled).toBe(false);
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
