// The links both tRPC clients send calls through: queries stream in one batch and give up on a hung call, other
// mutations batch without a time limit (they may have landed), and page visits go alone so they never wait for or hold
// up a batch. Every call is a JSON POST, so no input is ever in a URL.
import type { AnyRouter } from "@trpc/server";
import { httpBatchLink, httpBatchStreamLink, httpLink, splitLink, type TRPCLink } from "@trpc/client";

/** A query still unanswered after this long fails, so its screen shows the error state with Try again. */
export const QUERY_TIMEOUT_MS = 30_000;

/** The one call that reports page visits; sent on its own (a later change moves visits to another tool). */
const PAGE_VISIT_PATH = "usage.track";

/** A fetch that aborts when the caller does or when the time limit passes, whichever comes first. */
const fetchWithTimeout: NonNullable<Parameters<typeof httpBatchStreamLink>[0]["fetch"]> = (input, init) => {
  const limit = AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, limit]) : limit;
  return fetch(input, { ...(init as RequestInit | undefined), signal });
};

export function apiLinks(url: string): TRPCLink<AnyRouter>[] {
  const common = { url, methodOverride: "POST" } as const;
  return [
    splitLink({
      condition: (operation) => operation.type === "query",
      true: httpBatchStreamLink({ ...common, fetch: fetchWithTimeout }),
      false: splitLink({
        condition: (operation) => operation.path === PAGE_VISIT_PATH,
        true: httpLink(common),
        false: httpBatchLink(common),
      }),
    }),
  ];
}
