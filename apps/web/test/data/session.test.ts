// Signing out leaves nothing readable on the device: the cache in memory and its IndexedDB copy are gone, and the
// app's other tabs are told, even when the api can't be reached.
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { describe, expect, it, vi } from "vitest";
import type { AuthClient } from "@/data/auth-client";
import { createQueryPersister, hasPersistedQueries } from "@/data/persistence";
import { listenForSignOut, signOut } from "@/data/session";

/** A cache holding one organization's staff list, saved to IndexedDB as the app saves it. */
async function savedCache(): Promise<QueryClient> {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["staff", "list"], [{ name: "Ravi", email: "ravi@sharma.in" }]);
  await persistQueryClientSave({ queryClient, persister: createQueryPersister() });
  expect(await hasPersistedQueries()).toBe(true);
  return queryClient;
}

function authAnswering(signOutResult: ReturnType<AuthClient["signOut"]>): AuthClient {
  return { signOut: vi.fn(() => signOutResult) } as unknown as AuthClient;
}

describe("signOut", () => {
  it("ends the session, then wipes the cache and its saved copy", async () => {
    const queryClient = await savedCache();
    const auth = authAnswering(Promise.resolve({ ok: true, data: null }));
    await signOut(queryClient, auth);
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(["staff", "list"])).toBeUndefined();
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("wipes the device even when the api can't be reached", async () => {
    const queryClient = await savedCache();
    await signOut(queryClient, authAnswering(Promise.reject(new TypeError("Failed to fetch")))).catch(() => undefined);
    expect(queryClient.getQueryData(["staff", "list"])).toBeUndefined();
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("tells the app's other tabs", async () => {
    const otherTab = vi.fn();
    const stopListening = listenForSignOut(otherTab);
    await signOut(new QueryClient(), authAnswering(Promise.resolve({ ok: true, data: null })));
    await vi.waitFor(() => {
      expect(otherTab).toHaveBeenCalledOnce();
    });
    stopListening();
  });
});
