// Signing out leaves the screen as soon as the device is wiped (N3): nothing of the organization renders, the sign-in
// page loads, and the api is told without anyone waiting for it; while this device's push subscription is still going
// (up to 3s), the screen says it is signing out. The sign-out is owed from before the call goes out (N2), so a call that
// never lands is settled by the next page; one that lands clears it.
import "fake-indexeddb/auto";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSignOutOwed } from "@/data/owed-sign-out";
import { deleteSavedCopies, hasPersistedQueries } from "@/data/persistence";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { SignOutButton } from "@/shell/sign-out";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { staffNamed } from "../support/saved-copy";
import { fakePushBrowser } from "../notifications/fake-push-browser";
import { forgetRenders, renderApp } from "../support/staff-screen";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

/** What the device looked like at the moment the sign-in page was asked for. */
interface Leaving {
  screen: string;
  saved: Promise<boolean>;
  owed: boolean;
}

async function signOutFromStaffScreen(signOutAnswer: Parameters<typeof stubApi>[0][string]) {
  const api = stubApi({
    "me.get": { data: member({ isOwner: true }) },
    "staff.list": { data: [staffNamed("Ravi")] },
    "auth/sign-out": signOutAnswer,
  });
  const leaving: Leaving[] = [];
  const { container } = renderApp(<SignOutButton />);
  vi.mocked(loadPage).mockImplementation(() => {
    leaving.push({ screen: container.innerHTML, saved: hasPersistedQueries(), owed: isSignOutOwed() });
  });
  expect(await screen.findByText("Asha: Ravi")).toBeVisible();
  await vi.waitFor(async () => {
    expect(await hasPersistedQueries()).toBe(true);
  });
  await userEvent.click(screen.getByRole("button", { name: messages.shell.navigation.signOut }));
  await vi.waitFor(() => {
    expect(loadPage).toHaveBeenCalledWith("/sign-in");
  });
  return { api, leaving };
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
});

describe("signing out", () => {
  it("leaves a blank screen for the sign-in page as soon as the device is wiped, while the api call hangs", async () => {
    const { api, leaving } = await signOutFromStaffScreen("never");
    expect(api.calls).toContain("auth/sign-out");
    const [left] = leaving;
    expect(left?.screen).toBe("");
    expect(await left?.saved).toBe(false);
    // Owed while the call is still under way: if the page goes before it lands, the next page settles it.
    expect(left?.owed).toBe(true);
    expect(isSignOutOwed()).toBe(true);
  });

  it("says it is signing out while this device's push subscription takes its time to go", async () => {
    const browser = fakePushBrowser({ subscribed: true, unsubscribe: () => new Promise<boolean>(() => undefined) });
    stubApi({
      "me.get": { data: member({ isOwner: true }) },
      "staff.list": { data: [staffNamed("Ravi")] },
      "notifications.push.unsubscribe": "never",
      "auth/sign-out": { data: {} },
    });
    renderApp(<SignOutButton />);
    expect(await screen.findByText("Asha: Ravi")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: messages.shell.navigation.signOut }));
    expect(await screen.findByText(messages.common.signingOut)).toBeVisible();
    expect(screen.queryByText(/Ravi/)).toBeNull();
    // Push gets its 3s, then the sign-in page loads anyway.
    await vi.waitFor(
      () => {
        expect(loadPage).toHaveBeenCalledWith("/sign-in");
      },
      { timeout: 5_000 },
    );
    browser.restore();
  });

  it("clears the owed sign-out once the api has ended the session", async () => {
    await signOutFromStaffScreen({ data: {} });
    await vi.waitFor(() => {
      expect(isSignOutOwed()).toBe(false);
    });
  });
});
