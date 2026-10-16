// Support stops impersonating from the banner (spec 6.1): Better Auth gives the session back to support, the device
// forgets the member's data, its other tabs are told (they still hold the member's), and the console opens. A stop
// the api refused says why, and nothing is wiped or told.
import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { AuthClient } from "@/data/auth-client";
import { locale, messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { StopImpersonatingButton } from "@/shell/stop-impersonating";
import { pause } from "../support/saved-copy";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const { banners } = messages.shell;

function renderButton(stopImpersonating: AuthClient["stopImpersonating"]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["staff", "list"], [{ name: "Ravi Kumar" }]);
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <StopImpersonatingButton auth={{ stopImpersonating }} />
        <Toaster />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return queryClient;
}

/** Another tab of the app, listening for this device's sign-outs (data/session.ts). */
function otherTab() {
  const channel = new BroadcastChannel("travel-crm-session");
  const heard = vi.fn<(data: unknown) => void>();
  channel.onmessage = (event: MessageEvent<unknown>) => {
    heard(event.data);
  };
  return {
    heard,
    close: () => {
      channel.close();
    },
  };
}

afterEach(() => {
  vi.mocked(loadPage).mockReset();
});

describe("StopImpersonatingButton", () => {
  it("stops, forgets the member's data, then opens the console", async () => {
    const stop = vi.fn(() => Promise.resolve({ ok: true as const, data: null }));
    const queryClient = renderButton(stop);
    await userEvent.click(screen.getByRole("button", { name: banners.stop }));
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/console");
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it("tells the other tabs once the member's data is gone here, so they forget theirs", async () => {
    const tab = otherTab();
    const queryClient = renderButton(() => Promise.resolve({ ok: true as const, data: null }));
    const cacheWhenTold: number[] = [];
    tab.heard.mockImplementation(() => cacheWhenTold.push(queryClient.getQueryCache().getAll().length));
    await userEvent.click(screen.getByRole("button", { name: banners.stop }));
    await vi.waitFor(() => {
      expect(tab.heard).toHaveBeenCalledWith(expect.objectContaining({ type: "signed-out" }));
    });
    tab.close();
    expect(cacheWhenTold).toEqual([0]);
  });

  it("says why a stop failed, and keeps the page as it is", async () => {
    const stop = vi.fn(() =>
      Promise.resolve({ ok: false as const, status: 0, code: "NETWORK", retryAfterSeconds: null }),
    );
    const tab = otherTab();
    const queryClient = renderButton(stop);
    await userEvent.click(screen.getByRole("button", { name: banners.stop }));
    expect(await screen.findByText(messages.errors.network)).toBeVisible();
    expect(loadPage).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    await pause(20);
    tab.close();
    expect(tab.heard).not.toHaveBeenCalled();
  });
});
