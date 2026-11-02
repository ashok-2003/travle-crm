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
 * A fetch that aborts when the caller does or when the time limit passes, whichever comes first. Combined by hand:
 * AbortSignal.any is missing from browsers still in use (Safari before 17.4, Chrome before 116, Firefox before 124).
 * The limit runs until the response starts (its headers); a streamed body is not cut short once it is flowing.
 */
const fetchWithTimeout: NonNullable<Parameters<typeof httpBatchStreamLink>[0]["fetch"]> = (input, init) => {
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
  return fetch(input, { ...(init as RequestInit | undefined), signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    caller?.removeEventListener("abort", onCallerAbort);
  });
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
