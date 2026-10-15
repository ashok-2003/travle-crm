// A Better Auth call that finds the session gone (changing the password, turning two-factor on or off) leaves the
// page as a tRPC 401 does: the device is wiped, then the person signs in again and comes back. A 401 that only says
// a code was wrong is the screen's to explain, and leaves nobody's page.
import "fake-indexeddb/auto";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/data/auth-client";
import { deleteSavedCopies, hasPersistedQueries } from "@/data/persistence";
import { loadPage } from "@/lib/navigate";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { pause, staffNamed } from "../support/saved-copy";
import { forgetRenders, renderApp } from "../support/staff-screen";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

async function openAccountPage(authAnswers: Parameters<typeof stubApi>[0]) {
  window.history.replaceState(null, "", "/account");
  stubApi({ "me.get": { data: member() }, "staff.list": { data: [staffNamed("Ravi")] }, ...authAnswers });
  const savedWhenLeaving: Promise<boolean>[] = [];
  vi.mocked(loadPage).mockImplementation(() => {
    savedWhenLeaving.push(hasPersistedQueries());
  });
  const { container } = renderApp();
  expect(await screen.findByText("Asha: Ravi")).toBeVisible();
  await vi.waitFor(async () => {
    expect(await hasPersistedQueries()).toBe(true);
  });
  return { container, savedWhenLeaving };
}

beforeEach(async () => {
  await deleteSavedCopies();
  forgetRenders();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(loadPage).mockReset();
});

describe("a Better Auth call on a signed-in screen", () => {
  it("that finds the session gone wipes the device, then sends the person to sign in and back", async () => {
    const page = await openAccountPage({ "auth/change-password": { status: 401, reason: "UNAUTHORIZED" } });
    const changed = await authClient.changePassword({ currentPassword: "old-password", newPassword: "new-password-1" });
    expect(changed.ok).toBe(false);
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/sign-in?next=%2Faccount");
    });
    expect(await Promise.all(page.savedWhenLeaving)).toEqual([false]);
    expect(page.container).toBeEmptyDOMElement();
  });

  it("that only says a code was wrong leaves the page as it is", async () => {
    const page = await openAccountPage({ "auth/two-factor/verify-totp": { status: 401, reason: "INVALID_CODE" } });
    await authClient.confirmTwoFactor({ code: "000000" });
    await pause(100);
    expect(loadPage).not.toHaveBeenCalled();
    expect(page.container).toHaveTextContent("Asha: Ravi");
  });
});
