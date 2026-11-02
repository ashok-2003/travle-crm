// The links both tRPC clients send calls through: queries stream in one batch and give up on a hung call, other
// mutations batch without a time limit (they may have landed), and page visits go alone so they never wait for or hold
// up a batch. Every call is a JSON POST, so no input is ever in a URL.
import type { AnyRouter } from "@trpc/server";
import { QueryTimeoutError } from "./api-error";
import { httpBatchLink, httpBatchStreamLink, httpLink, splitLink, type TRPCLink } from "@trpc/client";

/** A query (or page-visit report) still unanswered after this long fails, so a screen shows its error state with Try again. */
export const QUERY_TIMEOUT_MS = 30_000;

/** The one call that reports page visits; sent on its own (a later change moves visits to another tool). */
const PAGE_VISIT_PATH = "usage.track";

/**
 * A fetch that aborts when the caller does or when the time limit passes, whichever comes first. The limit covers the
 * whole answer: a streamed batch whose headers came at once but whose body stalls (a procedure stuck waiting for the
 * database) is cut when it passes too, and the calls still waiting in it fail with QueryTimeoutError, while those that
 * already came through stay answered. Combined by hand: AbortSignal.any is missing from browsers still in use (Safari
 * before 17.4, Chrome before 116, Firefox before 124).
 */
const fetchWithTimeout: NonNullable<Parameters<typeof httpBatchStreamLink>[0]["fetch"]> = async (input, init) => {
  const controller = new AbortController();
  const caller = init?.signal;
  const onCallerAbort = () => {
    controller.abort(caller?.reason);
  };
  if (caller?.aborted) onCallerAbort();
  else caller?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new QueryTimeoutError());
  }, QUERY_TIMEOUT_MS);
  const finish = () => {
    clearTimeout(timer);
    caller?.removeEventListener("abort", onCallerAbort);
  };
  let response: Response;
  try {
    response = await fetch(input, { ...(init as RequestInit | undefined), signal: controller.signal });
  } catch (error) {
    finish();
    throw error;
  }
  if (response.body === null) {
    finish();
    return response;
  }
  // The same answer, read through a stream that keeps the timer until the body ends, fails or is cancelled, and that
  // fails with the abort's reason the moment the signal fires (a body that is stalled never rejects its own read).
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      controller.signal.addEventListener("abort", () => {
        finish();
        stream.error(controller.signal.reason);
        void reader.cancel(controller.signal.reason).catch(() => undefined);
      });
    },
    async pull(stream) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          finish();
          stream.close();
        } else stream.enqueue(chunk.value);
      } catch (error) {
        finish();
        stream.error(error);
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
};

export function apiLinks(url: string): TRPCLink<AnyRouter>[] {
  const common = { url, methodOverride: "POST" } as const;
  return [
    splitLink({
      condition: (operation) => operation.type === "query",
      true: httpBatchStreamLink({ ...common, fetch: fetchWithTimeout }),
      false: splitLink({
        condition: (operation) => operation.path === PAGE_VISIT_PATH,
        true: httpLink({ ...common, fetch: fetchWithTimeout }),
        false: httpBatchLink(common),
      }),
    }),
  ];
}
