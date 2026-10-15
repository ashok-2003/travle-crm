// Signing out removes this browser's push subscription first (spec 9.4), so a shared phone never gets the last
// person's pushes: from the api while the session can still say whose it is, then from the push service; best effort,
// and nothing about it holds up the wipe or stops the sign-out.
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "@/data/auth-client";
import { isSignOutOwed } from "@/data/owed-sign-out";
import { signOut } from "@/data/session";
import { stubApi } from "../support/api-stub";
import { fakePushBrowser, THIS_PHONE, type FakePushBrowser } from "./fake-push-browser";
import { sentInputs } from "./sent-inputs";

type SignOutResult = Awaited<ReturnType<AuthClient["signOut"]>>;
const answered: SignOutResult = { ok: true, data: null };

let browser: FakePushBrowser | undefined;

afterEach(() => {
  browser?.restore();
  browser = undefined;
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("signing out", () => {
  it("removes this browser's push subscription from the api and the push service before the session ends", async () => {
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    const api = stubApi({ "notifications.push.unsubscribe": { data: null } });
    const queryClient = new QueryClient();
    queryClient.setQueryData(["notifications", "unreadCount"], 3);
    const atSignOut: unknown[] = [];
    const auth = {
      signOut: vi.fn(() => {
        atSignOut.push([...api.calls], browser?.subscription() ?? null, queryClient.getQueryCache().getAll().length);
        return Promise.resolve(answered);
      }),
    };
    await signOut(queryClient, auth);
    await vi.waitFor(() => {
      expect(auth.signOut).toHaveBeenCalledOnce();
    });
    expect(atSignOut).toEqual([["notifications.push.unsubscribe"], null, 0]);
    expect(sentInputs("notifications.push.unsubscribe")).toEqual([{ endpoint: THIS_PHONE }]);
  });

  it("asks the api nothing about push for a browser without a subscription", async () => {
    browser = fakePushBrowser({ permission: "granted" });
    const api = stubApi({});
    await signOut(new QueryClient(), { signOut: () => Promise.resolve(answered) });
    expect(api.calls).toEqual([]);
  });

  it("still signs out when removing the subscription fails, and reports it", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const failing = () => Promise.reject(new Error("the push service is down"));
    const auth = { signOut: vi.fn(() => Promise.resolve(answered)) };
    await signOut(new QueryClient(), auth, failing);
    await vi.waitFor(() => {
      expect(isSignOutOwed()).toBe(false);
    });
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(reported).toHaveBeenCalledOnce();
  });
});
