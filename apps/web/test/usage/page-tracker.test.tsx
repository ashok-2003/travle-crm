// Page visits: nothing when a page opens, one every two minutes while it is visible, one when it closes, and none
// at all while support is signed in as the member.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { MeProvider } from "@/session/me-context";
import { PAGE_TRACK_BEAT_MS, PageTracker } from "@/usage/page-tracker";
import { member } from "../support/members";

vi.mock("next/navigation", () => ({ usePathname: () => "/leads" }));

function renderTracker(impersonatedBy: string | null = null) {
  const sent: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
      return Promise.resolve(Response.json({ result: { data: { visitId: "visit-1" } } }));
    }),
  );
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
        <MeProvider me={member({ impersonatedBy })}>
          <PageTracker />
        </MeProvider>
      </TRPCProvider>
    </QueryClientProvider>,
  );
  return { sent, view };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PageTracker", () => {
  it("sends nothing when a page opens, one report after two minutes and one when it closes", async () => {
    const { sent, view } = renderTracker();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(PAGE_TRACK_BEAT_MS);
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]).toMatchObject({ path: "/leads", seconds: 120 });
    view.unmount();
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent[1]).toMatchObject({ path: "/leads", visitId: "visit-1" });
    expect(PAGE_TRACK_BEAT_MS).toBe(120_000);
  });

  it("sends nothing while support is signed in as the member", async () => {
    const { sent, view } = renderTracker("0199a000-0000-7000-8000-0000000000aa");
    await vi.advanceTimersByTimeAsync(PAGE_TRACK_BEAT_MS * 2);
    view.unmount();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent).toEqual([]);
  });
});
