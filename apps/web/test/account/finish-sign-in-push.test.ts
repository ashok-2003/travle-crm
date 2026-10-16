// Signing in removes this browser's push subscription (spec 9.4): a shared phone must not keep the last person's
// pushes, and unsubscribing needs no network, so it works offline and asks the api nothing.
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finishSignIn } from "@/account/finish-sign-in";
import { stubApi } from "../support/api-stub";
import { fakePushBrowser, type FakePushBrowser } from "../notifications/fake-push-browser";

let browser: FakePushBrowser | undefined;

afterEach(() => {
  browser?.restore();
  browser = undefined;
  vi.unstubAllGlobals();
});

describe("finishSignIn", () => {
  it("removes this browser's subscription from its push service, without the api, before the app opens", async () => {
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    const api = stubApi({});
    const open = vi.fn(() => {
      expect(browser?.subscription()).toBeNull();
    });
    await finishSignIn(new QueryClient(), "/", open);
    expect(open).toHaveBeenCalledWith("/");
    expect(api.calls).toEqual([]);
  });

  it("still opens the app when the browser can't forget the subscription, and reports it", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    browser = fakePushBrowser({
      permission: "granted",
      subscribed: true,
      unsubscribe: () => Promise.reject(new DOMException("no", "AbortError")),
    });
    const open = vi.fn();
    await finishSignIn(new QueryClient(), "/staff", open);
    expect(open).toHaveBeenCalledWith("/staff");
    expect(reported).toHaveBeenCalledOnce();
  });
});
