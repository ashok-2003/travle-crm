// Signing out leaves nothing to restore, with the cache saved exactly as the app saves it: saving stops before
// anything is deleted, so no save can land afterwards; the cache, its saved copy and the service worker's pages go;
// other tabs are told; only then is the api asked. Offline, the device is still wiped and the sign-out is owed.
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "@/data/auth-client";
import { isSignOutOwed } from "@/data/owed-sign-out";
import { createQueryCopy, deleteSavedCopies, hasPersistedQueries } from "@/data/persistence";
import { announceSignOut, listenForSignOut, signOut, wipeLocalData } from "@/data/session";
import { pause, savingClient, TEST_BUILD } from "../support/saved-copy";

const owner = { userId: "user-a", organizationId: "org-a" };
type SignOutResult = Awaited<ReturnType<AuthClient["signOut"]>>;
const answered: SignOutResult = { ok: true, data: null };
const unreachable: SignOutResult = { ok: false, status: 0, code: "NETWORK", retryAfterSeconds: null };

/** A page holding three queries it restored, saving them as the app does, with the throttle idle. */
async function pageWithSavedData(): Promise<QueryClient> {
  const previous = savingClient(owner);
  previous.queryClient.setQueryData(["staff", "list"], [{ email: "ravi@sharma.in" }]);
  await vi.waitFor(async () => {
    expect(await hasPersistedQueries()).toBe(true);
  });
  await previous.copy.stop();
  // This page: restored data in memory, then saving starts, as the provider starts it once the page has opened.
  const queryClient = new QueryClient();
  queryClient.setQueryData(["me", "get"], { user: { id: "user-a" } });
  queryClient.setQueryData(["staff", "list"], [{ email: "ravi@sharma.in" }]);
  queryClient.setQueryData(["roles", "list"], [{ key: "sales" }]);
  createQueryCopy(queryClient, { owner: () => owner, buster: TEST_BUILD }).startSaving();
  return queryClient;
}

beforeEach(async () => {
  await deleteSavedCopies();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("wipeLocalData", () => {
  it("leaves nothing in IndexedDB, at once or after the throttle's interval, and a fresh page restores nothing", async () => {
    const queryClient = await pageWithSavedData();
    await wipeLocalData(queryClient);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(await hasPersistedQueries()).toBe(false);
    await pause(1_200);
    expect(await hasPersistedQueries()).toBe(false);
    expect(await createQueryCopy(new QueryClient(), { owner: () => owner, buster: TEST_BUILD }).read()).toBeUndefined();
  });

  it("cancels a save the throttle was still holding back", async () => {
    const { queryClient } = savingClient(owner);
    queryClient.setQueryData(["staff", "list"], [{ email: "ravi@sharma.in" }]);
    // The first change saves at once; this one waits a second in the throttle.
    queryClient.setQueryData(["roles", "list"], [{ key: "sales" }]);
    await wipeLocalData(queryClient);
    await pause(1_200);
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("deletes the service worker's page copies, and only those", async () => {
    const deleted = vi.fn((name: string) => Promise.resolve(name.length > 0));
    vi.stubGlobal("caches", { keys: () => Promise.resolve(["pages-v1", "pages-v2", "static-v1"]), delete: deleted });
    await wipeLocalData(new QueryClient());
    expect(deleted.mock.calls.map(([name]) => name)).toEqual(["pages-v1", "pages-v2"]);
  });

  it("reports a failed step once, still runs the others, and never rejects", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    vi.stubGlobal("caches", { keys: () => Promise.reject(new Error("Cache Storage is broken")), delete: vi.fn() });
    const queryClient = await pageWithSavedData();
    await expect(wipeLocalData(queryClient)).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalledOnce();
    expect(await hasPersistedQueries()).toBe(false);
  });
});

describe("signOut", () => {
  it("wipes the device and tells the other tabs before asking the api", async () => {
    const queryClient = await pageWithSavedData();
    const otherTab = new BroadcastChannel("travel-crm-session");
    const toldOtherTab = new Promise((resolve) => {
      otherTab.onmessage = resolve;
    });
    const stateWhenAsked: unknown[] = [];
    const auth = {
      signOut: vi.fn(async () => {
        stateWhenAsked.push(await hasPersistedQueries(), queryClient.getQueryCache().getAll().length);
        await toldOtherTab;
        return answered;
      }),
    };
    await signOut(queryClient, auth);
    otherTab.close();
    expect(stateWhenAsked).toEqual([false, 0]);
    expect(isSignOutOwed()).toBe(false);
  });

  it("wipes at once offline, without waiting for the api, and owes the sign-out", async () => {
    const queryClient = await pageWithSavedData();
    let answer: (result: SignOutResult) => void = () => undefined;
    const signingOut = signOut(queryClient, { signOut: () => new Promise((resolve) => (answer = resolve)) });
    await vi.waitFor(async () => {
      expect(await hasPersistedQueries()).toBe(false);
    });
    answer(unreachable);
    await signingOut;
    expect(isSignOutOwed()).toBe(true);
  });

  it("still tells the other tabs when the wipe fails, and doesn't reject", async () => {
    vi.stubGlobal("reportError", vi.fn());
    vi.stubGlobal("caches", { keys: () => Promise.reject(new Error("Cache Storage is broken")), delete: vi.fn() });
    const otherTab = vi.fn();
    const channel = new BroadcastChannel("travel-crm-session");
    channel.onmessage = otherTab;
    await expect(signOut(new QueryClient(), { signOut: () => Promise.resolve(answered) })).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(otherTab).toHaveBeenCalledOnce();
    });
    channel.close();
  });
});

describe("listenForSignOut", () => {
  it("hears other tabs, but not this page's own announcement", async () => {
    const signedOutElsewhere = vi.fn();
    const stopListening = listenForSignOut(signedOutElsewhere);
    announceSignOut();
    const otherTab = new BroadcastChannel("travel-crm-session");
    otherTab.postMessage({ type: "signed-out", from: "another-tab" });
    otherTab.close();
    await vi.waitFor(() => {
      expect(signedOutElsewhere).toHaveBeenCalledOnce();
    });
    await pause(50);
    expect(signedOutElsewhere).toHaveBeenCalledOnce();
    stopListening();
  });
});
