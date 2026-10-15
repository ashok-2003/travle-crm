// When the saved copy may show. Before me.get answers, only when the device reports offline: then nobody can be asked,
// and it shows at once, even on a cold start the query library hasn't heard about (N1). Online, it waits for me.get,
// however slow, so a copy is never shown before it is known to be this person's.
import "fake-indexeddb/auto";
import { onlineManager } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSavedCopies } from "@/data/persistence";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { pause, saveCopyFor, staffNamed } from "../support/saved-copy";
import { forgetRenders, renderApp, rendered } from "../support/staff-screen";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const asha = member({ isOwner: true });

beforeEach(async () => {
  await deleteSavedCopies();
  window.history.replaceState(null, "", "/staff");
  forgetRenders();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Opening offline tells TanStack so; the next test starts online again.
  onlineManager.setOnline(true);
});

describe("opening a page with a saved copy", () => {
  it("shows the copy at once when the device starts offline", async () => {
    await saveCopyFor(asha, ["Ravi"]);
    // The browser knows it's offline; TanStack's onlineManager only learns from events, and none has come.
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    stubApi({ "me.get": "offline", "staff.list": "offline" });
    renderApp();
    expect(await screen.findByText("Asha: Ravi", undefined, { timeout: 500 })).toBeVisible();
  });

  it("refreshes the copy and asks me.get again when the device comes back online", { timeout: 10_000 }, async () => {
    await saveCopyFor(asha, ["Ravi"]);
    const browserOnLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const api = stubApi({ "me.get": "offline", "staff.list": "offline" });
    renderApp();
    expect(await screen.findByText("Asha: Ravi", undefined, { timeout: 500 })).toBeVisible();
    // Long enough for any retries a believed-online query library would make to run out.
    await pause(3_500);
    const beforeReconnecting = api.calls.length;
    api.answer("me.get", { data: asha });
    api.answer("staff.list", { data: [staffNamed("Ravi"), staffNamed("Meera")] });
    browserOnLine.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    expect(await screen.findByText("Asha: Ravi, Meera")).toBeVisible();
    expect(api.calls.slice(beforeReconnecting)).toEqual(expect.arrayContaining(["me.get", "staff.list"]));
  });

  it("online, when me.get fails, opens at once (asking only once) and shows nothing saved", async () => {
    await saveCopyFor(asha, ["Ravi"]);
    const api = stubApi({ "me.get": "offline", "staff.list": "offline" });
    renderApp();
    // The screens' own queries start once the page has opened; with retries, the owner check would hold them 3s.
    await vi.waitFor(
      () => {
        expect(api.calls).toContain("staff.list");
      },
      { timeout: 500 },
    );
    expect(api.calls.indexOf("staff.list")).toBeGreaterThan(api.calls.indexOf("me.get"));
    expect(rendered.join("\n")).not.toMatch(/Ravi/);
  });

  it("online, shows nothing of the copy until me.get answers, however long it takes", { timeout: 15_000 }, async () => {
    await saveCopyFor(asha, ["Ravi"]);
    const slowMe = heldAnswer({ data: asha });
    stubApi({ "me.get": slowMe.answer, "staff.list": { data: [staffNamed("Ravi"), staffNamed("Meera")] } });
    renderApp();
    await pause(5_000);
    expect(rendered.filter((text) => text !== "loading")).toEqual([]);
    slowMe.release();
    expect(await screen.findByText("Asha: Ravi, Meera")).toBeVisible();
    expect(rendered.find((text) => text !== "loading")).toBe("Asha: Ravi");
  });
});
