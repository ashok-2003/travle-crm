// Support stops impersonating from the banner (spec 6.1): Better Auth gives the session back to support, the app's
// data on this device is wiped, then its other tabs are told (they still hold the member's data), then the console
// opens, even if telling the tabs fails. A stop the api refused says why, and nothing is wiped or told.
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { AuthClient } from "@/data/auth-client";
import type { PageData } from "@/data/page-data";
import { DataProviders, usePageData } from "@/data/providers";
import type * as Session from "@/data/session";
import { announceSignOut, wipeLocalData } from "@/data/session";
import { locale, messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { StopImpersonatingButton } from "@/shell/stop-impersonating";
import { pause } from "../support/saved-copy";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));
// The real steps, watched, so a test can see their order.
vi.mock("@/data/session", async (importOriginal) => {
  const actual = await importOriginal<typeof Session>();
  return { ...actual, wipeLocalData: vi.fn(actual.wipeLocalData), announceSignOut: vi.fn(actual.announceSignOut) };
});

const { banners } = messages.shell;
const stopped = () => Promise.resolve({ ok: true as const, data: null });

/** The button inside the app's own data layer, whose query cache holds the member's data. */
async function renderButton(stopImpersonating: AuthClient["stopImpersonating"]) {
  let page: PageData | undefined;
  function GrabPage() {
    page = usePageData();
    return null;
  }
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DataProviders>
        <GrabPage />
        <StopImpersonatingButton auth={{ stopImpersonating }} />
      </DataProviders>
      <Toaster />
    </NextIntlClientProvider>,
  );
  const button = await screen.findByRole("button", { name: banners.stop });
  if (!page) throw new Error("the page's data layer didn't open");
  page.queryClient.setQueryData(["staff", "list"], [{ name: "Ravi Kumar" }]);
  return { button, queryClient: page.queryClient };
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

let steps: string[] = [];

beforeEach(async () => {
  steps = [];
  const actual = await vi.importActual<typeof Session>("@/data/session");
  vi.mocked(wipeLocalData).mockImplementation(async (queryClient) => {
    await actual.wipeLocalData(queryClient);
    steps.push("wiped");
  });
  vi.mocked(announceSignOut).mockImplementation(() => {
    steps.push("told the other tabs");
    actual.announceSignOut();
  });
  vi.mocked(loadPage).mockImplementation((path) => {
    steps.push(`opened ${path}`);
  });
});

afterEach(() => {
  vi.mocked(loadPage).mockReset();
  vi.unstubAllGlobals();
});

describe("StopImpersonatingButton", () => {
  it("stops, wipes the app's data, then tells the other tabs, then opens the console", async () => {
    const tab = otherTab();
    const stop = vi.fn(stopped);
    const { button, queryClient } = await renderButton(stop);
    await userEvent.click(button);
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/console");
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(steps).toEqual(["wiped", "told the other tabs", "opened /console"]);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    await vi.waitFor(() => {
      expect(tab.heard).toHaveBeenCalledWith(expect.objectContaining({ type: "signed-out" }));
    });
    tab.close();
  });

  it("opens the console even when the other tabs can't be told, and reports why", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const failure = new Error("no channel");
    vi.mocked(announceSignOut).mockImplementationOnce(() => {
      throw failure;
    });
    const { button } = await renderButton(stopped);
    await userEvent.click(button);
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/console");
    });
    expect(reported).toHaveBeenCalledWith(failure);
  });

  it("says why a stop failed, and keeps the page and every tab as they are", async () => {
    const tab = otherTab();
    const { button, queryClient } = await renderButton(() =>
      Promise.resolve({ ok: false as const, status: 0, code: "NETWORK", retryAfterSeconds: null }),
    );
    await userEvent.click(button);
    expect(await screen.findByText(messages.errors.network)).toBeVisible();
    expect(loadPage).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    await pause(20);
    tab.close();
    expect(tab.heard).not.toHaveBeenCalled();
    expect(steps).toEqual([]);
  });
});
