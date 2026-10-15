// What the saved copy holds and when it is read: successful queries only, never a mutation (a temporary password
// waiting offline stays off the disk), always with whose data it is, and only from this build, within a day, and
// after the device's last wipe.
import "fake-indexeddb/auto";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { createStore, get } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryCopy, deleteSavedCopies, hasPersistedQueries } from "@/data/persistence";
import { pause, savingClient, TEST_BUILD } from "../support/saved-copy";

const owner = { userId: "user-a", organizationId: "org-a" };
const store = createStore("travel-crm", "query-cache");
const savedText = async () => String(await get("queries", store));

/** Waits until a copy is saved, then a little more for the throttle's later save. */
async function saved(): Promise<void> {
  await vi.waitFor(async () => {
    expect(await hasPersistedQueries()).toBe(true);
  });
  await pause(1_100);
}

beforeEach(async () => {
  await deleteSavedCopies();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("the saved copy", () => {
  it("never holds a mutation, so a temporary password waiting offline isn't written to disk", async () => {
    const { queryClient } = savingClient(owner);
    onlineManager.setOnline(false);
    const adding = queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: ["staff", "add"], mutationFn: () => Promise.resolve() });
    void adding.execute({ username: "asha", temporaryPassword: "Temporary-Pass-123" });
    queryClient.setQueryData(["staff", "list"], []);
    await saved();
    expect(adding.state.isPaused).toBe(true);
    expect(await savedText()).not.toContain("Temporary-Pass-123");
    expect(await savedText()).toContain('"mutations":[]');
  });

  it("holds only queries that succeeded, and none a screen keeps out", async () => {
    const { queryClient } = savingClient(owner);
    await queryClient
      .query({ queryKey: ["failed"], queryFn: () => Promise.reject(new Error("no")) })
      .catch(() => undefined);
    await queryClient.query({ queryKey: ["secret"], queryFn: () => "otpauth://x", meta: { persist: false } });
    queryClient.setQueryData(["staff", "list"], [{ name: "Ravi" }]);
    await saved();
    const text = await savedText();
    expect(text).toContain("Ravi");
    expect(text).not.toContain("failed");
    expect(text).not.toContain("otpauth");
  });

  it("is saved with whose data it is, and not at all while that isn't known", async () => {
    const unknown = savingClient(null);
    unknown.queryClient.setQueryData(["staff", "list"], [{ name: "Ravi" }]);
    await pause(100);
    expect(await hasPersistedQueries()).toBe(false);
    await unknown.copy.stop();
    savingClient(owner).queryClient.setQueryData(["staff", "list"], [{ name: "Ravi" }]);
    await saved();
    const copy = await createQueryCopy(new QueryClient(), { owner: () => null, buster: TEST_BUILD }).read();
    expect(copy?.owner).toEqual(owner);
  });

  it("is read only by the build that saved it", async () => {
    savingClient(owner).queryClient.setQueryData(["staff", "list"], [{ name: "Ravi" }]);
    await saved();
    expect(
      await createQueryCopy(new QueryClient(), { owner: () => null, buster: "next-build" }).read(),
    ).toBeUndefined();
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("is void once the device was wiped, even when a tab that missed the wipe saves again", async () => {
    // A tab opened before another tab wiped the device...
    const staleTab = savingClient(owner);
    await deleteSavedCopies();
    // ...changes its cache afterwards. Its save must not bring the data back.
    staleTab.queryClient.setQueryData(["staff", "list"], [{ name: "Ravi" }]);
    await pause(1_200);
    expect(await hasPersistedQueries()).toBe(false);
  });
});
