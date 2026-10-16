// The data layer as the app runs it, DataProviders over IndexedDB: a saved copy shows only for the person it was saved
// for, then refreshes; a copy saved for anyone else is wiped and never rendered; nothing is saved while support is
// signed in as a member, nor is support sent to the member's pending step; a 401 wipes, then sends the person to sign
// in and back; another tab's sign-out wipes this tab too, but never moves a signed-out screen, and a page's own
// announcement moves nothing; an owed sign-out is settled before me.get is asked.
import "fake-indexeddb/auto";
import { onlineManager } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createStore, get } from "idb-keyval";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSignOutOwed } from "@/data/owed-sign-out";
import { deleteSavedCopies, hasPersistedQueries } from "@/data/persistence";
import { DataProviders } from "@/data/providers";
import { announceSignOut } from "@/data/session";
import { loadPage, replacePage } from "@/lib/navigate";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { pause, saveCopyFor, staffNamed } from "../support/saved-copy";
import { forgetRenders, renderApp, rendered } from "../support/staff-screen";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const asha = member({ isOwner: true });
const kiran = member({
  isOwner: true,
  name: "Kiran",
  userId: "0199a000-0000-7000-8000-000000000009",
  organizationId: "0199a000-0000-7000-8000-000000000008",
});
const savedText = async () => String(await get("queries", createStore("travel-crm", "query-cache")));

function signOutInAnotherTab(): void {
  const otherTab = new BroadcastChannel("travel-crm-session");
  otherTab.postMessage({ type: "signed-out", from: "another-tab" });
  otherTab.close();
}

beforeEach(async () => {
  await deleteSavedCopies();
  window.localStorage.removeItem("travel-crm.sign-out-owed");
  window.history.replaceState(null, "", "/staff");
  forgetRenders();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(loadPage).mockReset();
  vi.mocked(replacePage).mockReset();
  onlineManager.setOnline(true);
});

describe("DataProviders", () => {
  it("shows a copy saved for the person signed in at once, then refreshes it", async () => {
    await saveCopyFor(asha, ["Ravi"]);
    const api = stubApi({
      "me.get": { data: asha },
      "staff.list": { data: [staffNamed("Ravi"), staffNamed("Meera")] },
    });
    renderApp();
    expect(await screen.findByText("Asha: Ravi, Meera")).toBeVisible();
    expect(rendered.find((text) => text !== "loading")).toBe("Asha: Ravi");
    // me.get once, to know whose the copy may be; then the restored list refreshes.
    expect(api.calls).toEqual(["me.get", "staff.list"]);
  });

  it("never renders a copy saved for someone else, and wipes it", async () => {
    await saveCopyFor(asha, ["Ravi"]);
    stubApi({ "me.get": { data: kiran }, "staff.list": { data: [staffNamed("Meera")] } });
    renderApp();
    expect(await screen.findByText("Kiran: Meera")).toBeVisible();
    expect(rendered.join("\n")).not.toMatch(/Asha|Ravi/);
    await vi.waitFor(async () => {
      expect(await savedText()).toContain("Meera");
    });
    expect(await savedText()).not.toContain("Ravi");
  });

  it("drops a copy shown offline the moment me.get names someone else", async () => {
    await saveCopyFor(asha, ["Ravi"]);
    onlineManager.setOnline(false);
    stubApi({ "me.get": { data: kiran }, "staff.list": { data: [staffNamed("Meera")] } });
    const { container } = renderApp();
    // Offline nobody can be asked, so the device shows what it saved for its last person.
    expect(await screen.findByText("Asha: Ravi")).toBeVisible();
    onlineManager.setOnline(true);
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/");
    });
    expect(container).toBeEmptyDOMElement();
    expect(await hasPersistedQueries()).toBe(false);
    expect(rendered).not.toContain("Kiran: Ravi");
  });

  it("on a 401, wipes the device, then sends the person to sign in and back, filters included", async () => {
    window.history.replaceState(null, "", "/staff?role=sales");
    await saveCopyFor(asha, ["Ravi"]);
    stubApi({ "me.get": { status: 401 }, "staff.list": { status: 401 } });
    const savedWhenLeaving: Promise<boolean>[] = [];
    vi.mocked(loadPage).mockImplementation(() => {
      savedWhenLeaving.push(hasPersistedQueries());
    });
    renderApp();
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/sign-in?next=%2Fstaff%3Frole%3Dsales");
    });
    expect(await Promise.all(savedWhenLeaving)).toEqual([false]);
    expect(rendered.join("\n")).not.toMatch(/Ravi/);
  });

  it("wipes this tab and sends it to sign in when another tab signs out", async () => {
    stubApi({ "me.get": { data: asha }, "staff.list": { data: [staffNamed("Ravi")] } });
    const { container } = renderApp();
    expect(await screen.findByText("Asha: Ravi")).toBeVisible();
    await vi.waitFor(async () => {
      expect(await hasPersistedQueries()).toBe(true);
    });
    signOutInAnotherTab();
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/sign-in");
    });
    expect(container).toBeEmptyDOMElement();
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("never leaves a signed-out screen, whichever tab announces a sign-out", async () => {
    stubApi({});
    for (const path of ["/reset-password", "/sign-in", "/offline"]) {
      window.history.replaceState(null, "", path);
      const { unmount } = render(
        <DataProviders>
          <p>Your password is changed</p>
        </DataProviders>,
      );
      // A reset announces its own sign-out; another tab may sign out at the same moment.
      announceSignOut();
      signOutInAnotherTab();
      await pause(100);
      expect(screen.getByText("Your password is changed"), path).toBeVisible();
      unmount();
    }
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("ignores its own announcement on a signed-in screen", async () => {
    stubApi({ "me.get": { data: asha }, "staff.list": { data: [staffNamed("Ravi")] } });
    renderApp();
    expect(await screen.findByText("Asha: Ravi")).toBeVisible();
    announceSignOut();
    await pause(100);
    expect(screen.getByText("Asha: Ravi")).toBeVisible();
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("sends a person with a step to take there in place of this page, so Back can't return to its data", async () => {
    stubApi({ "me.get": { data: asha }, "staff.list": { status: 403, reason: "CHANGE_PASSWORD" } });
    renderApp();
    await vi.waitFor(() => {
      expect(replacePage).toHaveBeenCalledWith("/change-password");
    });
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("saves nothing on support's device while support is signed in as the member", async () => {
    stubApi({
      "me.get": { data: member({ isOwner: true, impersonatedBy: kiran.user.id }) },
      "staff.list": { data: [staffNamed("Meera")] },
    });
    renderApp();
    expect(await screen.findByText("Asha: Meera")).toBeVisible();
    // Past the throttle's second, when a save would have landed.
    await pause(1_200);
    expect(await hasPersistedQueries()).toBe(false);
  });

  it("doesn't send support to the member's pending step, which only the member can take", async () => {
    const api = stubApi({
      "me.get": { data: { ...member({ impersonatedBy: kiran.user.id }), pendingStep: "SET_UP_TWO_FACTOR" } },
      "staff.list": { status: 403, reason: "SET_UP_TWO_FACTOR" },
    });
    renderApp();
    await vi.waitFor(() => {
      expect(api.calls).toContain("staff.list");
    });
    await pause(50);
    expect(replacePage).not.toHaveBeenCalled();
  });

  it("asks me.get again when a call is refused with a step that appeared, so its screen shows at once", async () => {
    const support = member({ impersonatedBy: kiran.user.id });
    const api = stubApi({ "me.get": { data: support }, "staff.list": { status: 403, reason: "SET_UP_TWO_FACTOR" } });
    renderApp();
    await vi.waitFor(() => {
      expect(api.calls.filter((call) => call === "me.get")).toHaveLength(2);
    });
    expect(replacePage).not.toHaveBeenCalled();
  });

  it("settles an owed sign-out before asking who is signed in", async () => {
    window.localStorage.setItem("travel-crm.sign-out-owed", "1");
    const api = stubApi({ "auth/sign-out": { data: {} }, "me.get": { status: 401 }, "staff.list": { status: 401 } });
    renderApp();
    await vi.waitFor(() => {
      expect(api.calls).toContain("me.get");
    });
    expect(api.calls[0]).toBe("auth/sign-out");
    expect(isSignOutOwed()).toBe(false);
  });

  it("asks nothing else while an owed sign-out can't reach the api, and settles it once back online", async () => {
    window.localStorage.setItem("travel-crm.sign-out-owed", "1");
    const api = stubApi({ "auth/sign-out": "offline" });
    renderApp();
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/sign-in");
    });
    expect(api.calls).toEqual(["auth/sign-out"]);
    expect(isSignOutOwed()).toBe(true);
    api.answer("auth/sign-out", { data: {} });
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(isSignOutOwed()).toBe(false);
    });
  });
});
