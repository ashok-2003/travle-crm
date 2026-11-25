// The "works best in the app" bar: phones in a browser only. Android that can install shows Install; an installed Android
// or an iPhone whose person used the installed app shows the home-screen line; an iPhone otherwise shows the Share line.
// Never inside the installed app, never on a computer, hidden for a week by x, and the installed app's visit is noted
// once a day. Every browser fact is stubbed: the user agent, touch, standalone, getInstalledRelatedApps, the saved prompt.
import { brand } from "@travel-crm/brand";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";
import { MeProvider } from "@/session/me-context";
import { InstallBanner } from "@/shell/install-banner";
import { HIDDEN_UNTIL_KEY, HIDE_FOR_MS, visitKey } from "@/shell/use-install-state";
import { heldAnswer, stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";

const words = messages.shell.installBar;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const LAPTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
const DAY = 24 * 60 * 60 * 1000;

interface Phone {
  userAgent: string;
  touch?: number;
  standalone?: boolean;
  iosStandalone?: boolean;
  relatedApps?: unknown[] | "missing";
  prompt?: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null;
}

function define(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}

function setPhone(phone: Phone) {
  define(navigator, "userAgent", phone.userAgent);
  define(navigator, "maxTouchPoints", phone.touch ?? 5);
  define(navigator, "standalone", phone.iosStandalone ?? undefined);
  define(window, "matchMedia", (query: string) => ({
    matches: query.includes("standalone") && phone.standalone === true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  define(
    navigator,
    "getInstalledRelatedApps",
    phone.relatedApps === "missing" || phone.relatedApps === undefined
      ? undefined
      : () => Promise.resolve(phone.relatedApps),
  );
  define(window, "deferredInstallPrompt", phone.prompt ?? null);
}

const asha = member();
function renderBar(answers: Record<string, Answer> = {}, me = asha) {
  const sent: unknown[] = [];
  const api = stubApi({
    "usage.installedApps": { data: { platforms: [] } },
    "usage.installedAppSeen": (input) => {
      sent.push(input);
      return { data: null };
    },
    ...answers,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          <MeProvider me={me}>
            <InstallBanner />
          </MeProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { api, sent, view };
}

const homeScreenLine = () => words.installed.replace("{product}", brand.productName);
const installLine = () => words.installable.replace("{product}", brand.productName);
const installable = () => ({
  prompt: vi.fn(() => Promise.resolve()),
  userChoice: Promise.resolve({ outcome: "accepted" }),
});

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "deferredInstallPrompt");
});

describe("the install bar's states", () => {
  it("offers Install on an Android phone whose browser saved the install prompt, and Install opens the sheet", async () => {
    const saved = installable();
    setPhone({ userAgent: PIXEL, prompt: saved });
    renderBar();
    expect(await screen.findByText(installLine())).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.install }));
    expect(saved.prompt).toHaveBeenCalledOnce();
  });

  it("says to open the app from the home screen on an Android phone that finds it installed", async () => {
    setPhone({ userAgent: PIXEL, relatedApps: [{ platform: "webapp" }] });
    renderBar();
    expect(await screen.findByText(homeScreenLine())).toBeVisible();
    expect(screen.queryByRole("button", { name: words.install })).toBeNull();
  });

  it("shows nothing on Android with no install prompt and no sign of the app, nor when the check is missing", async () => {
    setPhone({ userAgent: PIXEL, relatedApps: "missing" });
    const { api } = renderBar();
    await waitFor(() => {
      expect(api.calls).toContain("usage.installedApps");
    });
    expect(screen.queryByRole("button", { name: words.hide })).toBeNull();
  });

  it("tells an iPhone to tap Share, then Add to Home Screen", async () => {
    setPhone({ userAgent: IPHONE });
    renderBar();
    expect(await screen.findByText(words.ios)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.install })).toBeNull();
  });

  it("treats an iPad that looks like a Mac, by its touch screen, as an iPhone", async () => {
    setPhone({ userAgent: LAPTOP, touch: 5 });
    renderBar();
    expect(await screen.findByText(words.ios)).toBeVisible();
  });

  it("points an iPhone to the home screen when the server says this person opened the installed app on an iPhone", async () => {
    setPhone({ userAgent: IPHONE });
    renderBar({ "usage.installedApps": { data: { platforms: ["ios"] } } });
    expect(await screen.findByText(homeScreenLine())).toBeVisible();
    expect(screen.queryByText(words.ios)).toBeNull();
  });

  it("points an Android browser to the home screen when the server says the app was used on Android", async () => {
    setPhone({ userAgent: PIXEL });
    renderBar({ "usage.installedApps": { data: { platforms: ["android"] } } });
    expect(await screen.findByText(homeScreenLine())).toBeVisible();
    expect(screen.queryByRole("button", { name: words.install })).toBeNull();
  });

  it("ignores the other phone type's use of the installed app", async () => {
    setPhone({ userAgent: IPHONE });
    renderBar({ "usage.installedApps": { data: { platforms: ["android"] } } });
    expect(await screen.findByText(words.ios)).toBeVisible();
  });

  it("shows nothing on a computer", async () => {
    setPhone({ userAgent: LAPTOP, touch: 0, prompt: installable() });
    const { api } = renderBar();
    await act(() => Promise.resolve());
    expect(screen.queryByRole("button", { name: words.hide })).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("goes when the app is installed from the bar", async () => {
    setPhone({ userAgent: PIXEL, prompt: installable() });
    renderBar();
    await screen.findByText(installLine());
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    await waitFor(() => {
      expect(screen.queryByText(installLine())).toBeNull();
    });
  });

  it("works when storage is blocked: the bar shows, and x hides it for now", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setPhone({ userAgent: IPHONE });
    renderBar();
    await userEvent.click(await screen.findByRole("button", { name: words.hide }));
    expect(screen.queryByText(words.ios)).toBeNull();
  });
});

describe("what wins, and what waits", () => {
  it("offers Install when Chrome offered the prompt, even if the server remembers the app on Android", async () => {
    // Chrome offers it only where the app isn't installed on this phone (an uninstall, a new phone).
    setPhone({ userAgent: PIXEL, prompt: installable(), relatedApps: [{ platform: "webapp" }] });
    renderBar({ "usage.installedApps": { data: { platforms: ["android"] } } });
    expect(await screen.findByText(installLine())).toBeVisible();
  });

  it("shows nothing on an iPhone until the server's memory has answered, then one line, never two", async () => {
    setPhone({ userAgent: IPHONE });
    const held = heldAnswer({ data: { platforms: ["ios"] } });
    renderBar({ "usage.installedApps": held.answer });
    await act(() => Promise.resolve());
    expect(screen.queryByText(words.ios)).toBeNull();
    held.release();
    expect(await screen.findByText(homeScreenLine())).toBeVisible();
    expect(screen.queryByText(words.ios)).toBeNull();
  });

  it("gives no bar in an app's web view on an iPhone (no Safari in its user agent)", async () => {
    setPhone({ userAgent: IPHONE.replace(" Safari/604.1", "") });
    const { api } = renderBar();
    await act(() => Promise.resolve());
    expect(screen.queryByRole("button", { name: words.hide })).toBeNull();
    expect(api.calls).toEqual([]);
  });
});

describe("the installed iPhone app and the install prompt", () => {
  it("notes the visit from the installed iPhone app even when its user agent has no Safari", async () => {
    setPhone({ userAgent: IPHONE.replace(" Safari/604.1", ""), iosStandalone: true });
    const { sent } = renderBar();
    await waitFor(() => {
      expect(sent).toEqual([{ platform: "ios" }]);
    });
  });

  it("survives a rejected install prompt: the saved event is cleared", async () => {
    const saved = {
      prompt: vi.fn(() => Promise.reject(new Error("used"))),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    };
    setPhone({ userAgent: PIXEL, prompt: saved });
    renderBar();
    await userEvent.click(await screen.findByRole("button", { name: words.install }));
    await waitFor(() => {
      expect(window.deferredInstallPrompt).toBeNull();
    });
  });
});

describe("hiding the bar", () => {
  it("hides it for a week with x, and brings it back after", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-25T10:00:00Z") });
    setPhone({ userAgent: IPHONE });
    const first = renderBar();
    await userEvent
      .setup({ advanceTimers: () => undefined })
      .click(await screen.findByRole("button", { name: words.hide }));
    expect(screen.queryByText(words.ios)).toBeNull();
    expect(Number(localStorage.getItem(HIDDEN_UNTIL_KEY))).toBe(Date.now() + HIDE_FOR_MS);
    first.view.unmount();

    vi.setSystemTime(Date.now() + 6 * DAY);
    const soon = renderBar();
    await act(() => Promise.resolve());
    expect(screen.queryByText(words.ios)).toBeNull();
    soon.view.unmount();

    vi.setSystemTime(Date.now() + 2 * DAY);
    renderBar();
    expect(await screen.findByText(words.ios)).toBeVisible();
  });

  it("names x Hide and gives it a 44px target", async () => {
    setPhone({ userAgent: IPHONE });
    renderBar();
    expect(await screen.findByRole("button", { name: words.hide })).toHaveClass("size-11");
  });
});

describe("inside the installed app", () => {
  it("shows nothing, in Android's standalone mode and in iOS's", async () => {
    for (const phone of [
      { userAgent: PIXEL, standalone: true, prompt: installable() },
      { userAgent: IPHONE, iosStandalone: true },
    ]) {
      setPhone(phone);
      const { view, sent } = renderBar();
      // Let the visit's call land before this test ends, so it can't reach the next test's stub.
      await waitFor(() => {
        expect(sent).toHaveLength(1);
      });
      expect(screen.queryByRole("button", { name: words.hide })).toBeNull();
      view.unmount();
      localStorage.clear();
    }
  });

  it("notes the visit with the phone type, once a day", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-25T10:00:00Z") });
    setPhone({ userAgent: IPHONE, iosStandalone: true });
    const first = renderBar();
    await waitFor(() => {
      expect(first.sent).toEqual([{ platform: "ios" }]);
    });
    await waitFor(() => {
      expect(localStorage.getItem(visitKey(asha.user.id))).not.toBeNull();
    });
    first.view.unmount();

    const sameDay = renderBar();
    await act(() => Promise.resolve());
    expect(sameDay.sent).toEqual([]);
    sameDay.view.unmount();

    vi.setSystemTime(Date.now() + DAY + 1000);
    const nextDay = renderBar();
    await waitFor(() => {
      expect(nextDay.sent).toEqual([{ platform: "ios" }]);
    });
  });

  it("tries again at the next open when the server could not be reached", async () => {
    setPhone({ userAgent: IPHONE, iosStandalone: true });
    const failing = renderBar({ "usage.installedAppSeen": { status: 500 } });
    await waitFor(() => {
      expect(failing.api.calls).toContain("usage.installedAppSeen");
    });
    await act(() => Promise.resolve());
    expect(localStorage.getItem(visitKey(asha.user.id))).toBeNull();
    failing.view.unmount();
    const retry = renderBar();
    await waitFor(() => {
      expect(retry.sent).toEqual([{ platform: "ios" }]);
    });
  });

  it("keeps the daily throttle per person: a second person on the same phone is noted too", async () => {
    setPhone({ userAgent: IPHONE, iosStandalone: true });
    const first = renderBar();
    await waitFor(() => {
      expect(first.sent).toHaveLength(1);
    });
    await waitFor(() => {
      expect(localStorage.getItem(visitKey(asha.user.id))).not.toBeNull();
    });
    first.view.unmount();
    const other = member({ userId: "0199a000-0000-7000-8000-0000000000aa" });
    const second = renderBar({}, other);
    await waitFor(() => {
      expect(second.sent).toEqual([{ platform: "ios" }]);
    });
  });

  it("notes an Android visit as android, and asks the server nothing about the app", async () => {
    setPhone({ userAgent: PIXEL, standalone: true });
    const { sent, api } = renderBar();
    await waitFor(() => {
      expect(sent).toEqual([{ platform: "android" }]);
    });
    expect(api.calls).not.toContain("usage.installedApps");
  });

  it("still notes the visit when storage is blocked (the server keeps it to once a day)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setPhone({ userAgent: IPHONE, iosStandalone: true });
    const { sent } = renderBar();
    await waitFor(() => {
      expect(sent).toEqual([{ platform: "ios" }]);
    });
  });
});
