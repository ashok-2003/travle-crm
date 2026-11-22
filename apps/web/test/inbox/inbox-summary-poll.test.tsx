// The inbox counts are read once a minute, on the Inbox (where the live stream loads them again as chats change) and off it.
import { INBOX_POLL_MS } from "@travel-crm/contracts/inbox";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { INBOX_SUMMARY_POLL_MS, useInboxSummary } from "@/inbox/use-sales-inbox";

const navigation = vi.hoisted(() => ({ pathname: "/leads" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

/** What the summary query asks for: how often it reloads and how long its answer stays fresh. */
function pollingOn(pathname: string) {
  navigation.pathname = pathname;
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
  renderHook(() => useInboxSummary(), { wrapper });
  const options = queryClient.getQueryCache().getAll()[0]?.observers[0]?.options;
  return { every: options?.refetchInterval, staleTime: options?.staleTime };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInboxSummary", () => {
  it("reads the count once a minute, on the Inbox and off it", () => {
    expect(pollingOn("/leads")).toEqual({ every: 60_000, staleTime: 15_000 });
    expect(pollingOn("/inbox")).toEqual({ every: 60_000, staleTime: 15_000 });
    expect(INBOX_SUMMARY_POLL_MS).toBe(60_000);
    // The safety net under the live stream, not the 3 or 10 seconds of a poll that stands in for it.
    expect(INBOX_POLL_MS).toBe(60_000);
  });
});
