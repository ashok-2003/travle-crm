// The way into the console: whoAmI says who is signed in. Platform staff get the console, with a query cache of its
// own that the app's saved copy never holds; anyone else is told the console isn't theirs, and support signed in as a
// member is offered Stop, which, like the screen's me.get, goes through the app's cache, not the console's. A 401 sends the person to sign in and back, a pending step to take it and back, and any
// other failure says so with a Retry.
import "fake-indexeddb/auto";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProviders } from "@/console/data/console-providers";
import { ConsoleGate } from "@/console/session/console-gate";
import { useStaff } from "@/console/session/staff-context";
import { DataProviders, usePageData } from "@/data/providers";
import { locale, messages } from "@/i18n/messages";
import { loadPage, replacePage } from "@/lib/navigate";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { platformStaff } from "../support/platform-staff";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const { gate } = messages.console;

/** A console screen, saying whose console it is and which caches hold the console's queries. */
function Screen() {
  const staff = useStaff();
  const consoleQueries = useQueryClient().getQueryCache().getAll().length;
  const appQueries = usePageData().queryClient.getQueryCache().getAll().length;
  return (
    <p>
      Console for {staff.name}, {consoleQueries} console queries, {appQueries} app queries
    </p>
  );
}

/** The two caches, the app's and the console's, as the gate's screens see them. */
const caches: { app?: QueryClient; console?: QueryClient } = {};

function GrabCaches() {
  const app = usePageData().queryClient;
  const consoleCache = useQueryClient();
  useEffect(() => {
    caches.app = app;
    caches.console = consoleCache;
  }, [app, consoleCache]);
  return null;
}

function renderGate() {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DataProviders>
        <ConsoleProviders>
          <GrabCaches />
          <ConsoleGate>
            <Screen />
          </ConsoleGate>
        </ConsoleProviders>
      </DataProviders>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/console/plans?tier=growth");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(loadPage).mockReset();
  vi.mocked(replacePage).mockReset();
  window.history.replaceState(null, "", "/");
});

describe("ConsoleGate", () => {
  it("opens the console for platform staff, on the console's own query cache", async () => {
    stubApi({ "platform.whoAmI": { data: platformStaff("support") } });
    renderGate();
    expect(await screen.findByText("Console for Arjun Nair, 1 console queries, 0 app queries")).toBeVisible();
  });

  it("tells anyone else the console is for platform staff, and lets them sign out", async () => {
    stubApi({ "platform.whoAmI": { status: 403, reason: "PLATFORM_ONLY" }, "me.get": { data: member() } });
    renderGate();
    expect(await screen.findByText(gate.notStaff)).toBeVisible();
    expect(await screen.findByRole("button", { name: messages.console.navigation.signOut })).toBeVisible();
    expect(screen.queryByText(/Console for/)).toBeNull();
  });

  it("offers support signed in as a member Stop, not Sign out, which would strand support's own session", async () => {
    stubApi({
      "platform.whoAmI": { status: 403, reason: "PLATFORM_ONLY" },
      "me.get": { data: member({ impersonatedBy: platformStaff("support").userId }) },
    });
    renderGate();
    expect(await screen.findByText(gate.impersonating)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.shell.banners.stop })).toBeVisible();
    expect(screen.queryByRole("button", { name: messages.console.navigation.signOut })).toBeNull();
  });

  it("asks me.get in the app's cache there, and Stop wipes the app's data before the console opens", async () => {
    stubApi({
      "platform.whoAmI": { status: 403, reason: "PLATFORM_ONLY" },
      "me.get": { data: member({ impersonatedBy: platformStaff("support").userId }) },
      "auth/admin/stop-impersonating": { data: {} },
    });
    renderGate();
    const stop = await screen.findByRole("button", { name: messages.shell.banners.stop });
    const isMe = (query: { queryKey: readonly unknown[] }) => JSON.stringify(query.queryKey).includes('"me","get"');
    expect(caches.app?.getQueryCache().getAll().filter(isMe)).toHaveLength(1);
    expect(caches.console?.getQueryCache().getAll().filter(isMe)).toEqual([]);
    caches.app?.setQueryData(["staff", "list"], [{ name: "Ravi Kumar" }]);
    await userEvent.click(stop);
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/console");
    });
    expect(caches.app?.getQueryCache().getAll()).toEqual([]);
  });

  it("sends a signed-out visitor to sign in, and back to this page afterwards", async () => {
    stubApi({ "platform.whoAmI": { status: 401 } });
    renderGate();
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/sign-in?next=%2Fconsole%2Fplans%3Ftier%3Dgrowth");
    });
    expect(screen.queryByText(/Console for/)).toBeNull();
  });

  it("sends staff with a temporary password to replace it, and back to this page afterwards", async () => {
    stubApi({ "platform.whoAmI": { status: 403, reason: "CHANGE_PASSWORD" } });
    renderGate();
    await vi.waitFor(() => {
      expect(replacePage).toHaveBeenCalledWith("/change-password?next=%2Fconsole%2Fplans%3Ftier%3Dgrowth");
    });
    expect(screen.queryByText(gate.loadFailed)).toBeNull();
  });

  it("sends staff without two-factor to set it up, and back to this page afterwards", async () => {
    stubApi({ "platform.whoAmI": { status: 403, reason: "SET_UP_TWO_FACTOR" } });
    renderGate();
    await vi.waitFor(() => {
      expect(replacePage).toHaveBeenCalledWith("/two-factor-setup?next=%2Fconsole%2Fplans%3Ftier%3Dgrowth");
    });
  });

  it("says when whoAmI didn't load, and asks again on Try again", async () => {
    const api = stubApi({ "platform.whoAmI": "offline" });
    renderGate();
    // The app's queries try an unanswered call three times, a second and then two apart.
    expect(await screen.findByText(gate.loadFailed, undefined, { timeout: 5_000 })).toBeVisible();
    api.answer("platform.whoAmI", { data: platformStaff("super-admin") });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText(/Console for Kavita Rao/)).toBeVisible();
  });
});
