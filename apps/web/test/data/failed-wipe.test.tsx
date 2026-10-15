// Signing in opens the app even when its wipe fails (finishSignIn: wipeLocalData, then a full page load). That is
// safe only because a saved copy belongs to its owner: here person A's copy survives a wipe that deleted nothing, and
// person B, signing in next, is never shown any of it, whether or not the device's storage recovers, and however
// long me.get takes to say who B is.
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import type * as IdbKeyval from "idb-keyval";
import { createStore, get } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSavedCopies, hasPersistedQueries } from "@/data/persistence";
import { wipeLocalData } from "@/data/session";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { pause, saveCopyFor, staffNamed } from "../support/saved-copy";
import { forgetRenders, renderApp, rendered } from "../support/staff-screen";

/** While on, IndexedDB refuses to clear: the wipe's delete fails, and so does removing a copy. */
const broken = vi.hoisted(() => ({ storage: false }));
vi.mock("idb-keyval", async (importOriginal) => {
  const actual = await importOriginal<typeof IdbKeyval>();
  return {
    ...actual,
    clear: (...args: Parameters<typeof actual.clear>) =>
      broken.storage ? Promise.reject(new Error("IndexedDB is broken")) : actual.clear(...args),
  };
});
vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const asha = member({ isOwner: true });
const kiran = member({
  isOwner: true,
  name: "Kiran",
  userId: "0199a000-0000-7000-8000-000000000009",
  organizationId: "0199a000-0000-7000-8000-000000000008",
});

/** Asha's copy is saved; then a sign-in's wipe fails at every step that touches storage. */
async function signInWhoseWipeFails(): Promise<void> {
  await saveCopyFor(asha, ["Ravi"]);
  broken.storage = true;
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("localStorage is blocked");
  });
  await wipeLocalData(new QueryClient());
  setItem.mockRestore();
  expect(await hasPersistedQueries()).toBe(true);
}

beforeEach(async () => {
  broken.storage = false;
  await deleteSavedCopies();
  window.history.replaceState(null, "", "/staff");
  vi.stubGlobal("reportError", vi.fn());
  forgetRenders();
});

afterEach(() => {
  broken.storage = false;
  vi.unstubAllGlobals();
});

describe("a sign-in whose wipe failed", () => {
  it("still shows the next person nothing of the last one's, and drops the copy", async () => {
    await signInWhoseWipeFails();
    broken.storage = false;
    stubApi({ "me.get": { data: kiran }, "staff.list": { data: [staffNamed("Meera")] } });
    renderApp();
    expect(await screen.findByText("Kiran: Meera")).toBeVisible();
    expect(rendered.join("\n")).not.toMatch(/Asha|Ravi/);
    const saved = await get<string>("queries", createStore("travel-crm", "query-cache"));
    expect(saved ?? "").not.toContain("Ravi");
  });

  it(
    "shows nothing of it while storage stays broken, even when me.get takes 5 seconds",
    { timeout: 15_000 },
    async () => {
      await signInWhoseWipeFails();
      const slowMe = heldAnswer({ data: kiran });
      stubApi({ "me.get": slowMe.answer, "staff.list": { data: [staffNamed("Meera")] } });
      renderApp();
      await pause(5_000);
      expect(rendered.join("\n")).not.toMatch(/Asha|Ravi/);
      slowMe.release();
      expect(await screen.findByText("Kiran: Meera")).toBeVisible();
      expect(rendered.join("\n")).not.toMatch(/Asha|Ravi/);
      expect(reportError).toHaveBeenCalled();
    },
  );
});
