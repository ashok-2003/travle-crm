// Signing in again soon after signing out. The leaving page's own sign-out call usually lands after that page has
// gone, so the sign-in page finds the sign-out still owed and settles it. That must not cost the new sign-in its
// session. A sign-in waits for a settle call under way, so the old session's answer, which deletes the session cookie,
// can't land after the new cookie. And once a sign-in succeeds nothing is owed any more, so its first page can't
// sign the new session out.
import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishSignIn } from "@/account/finish-sign-in";
import { authClient } from "@/data/auth-client";
import { isSignOutOwed } from "@/data/owed-sign-out";
import { deleteSavedCopies } from "@/data/persistence";
import { DataProviders } from "@/data/providers";
import { member } from "../support/members";
import { pause, staffNamed } from "../support/saved-copy";
import { forgetRenders, renderApp } from "../support/staff-screen";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

type SignOutAnswers = "slowly" | "never, offline" | "at once";

/**
 * The device and the api: the session cookie as the browser holds it, which a sign-in sets and a sign-out's answer
 * deletes (Better Auth clears the cookie by name, whichever session it now holds). me.get answers only the new session.
 */
function stubDevice(signOut: SignOutAnswers) {
  const device = {
    cookie: "old" as "old" | "new" | null,
    calls: [] as string[],
    signOut,
    /** Sends the slow sign-out's answer. */
    release: (): void => undefined,
  };
  const slow = new Promise<void>((resolve) => {
    device.release = resolve;
  });
  const refused = { error: { message: "Signed out", code: -32001, data: { httpStatus: 401, reason: null } } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost").pathname;
      if (path === "/api/auth/sign-out") {
        device.calls.push(`sign-out with the ${device.cookie ?? "no"} cookie`);
        if (device.signOut === "never, offline") throw new TypeError("Failed to fetch");
        if (device.signOut === "slowly") await slow;
        device.cookie = null;
        return Response.json({ success: true });
      }
      if (path === "/api/auth/sign-in/email") {
        device.calls.push("sign-in");
        device.cookie = "new";
        return Response.json({ redirect: false });
      }
      const procedures = decodeURIComponent(path.slice("/api/trpc/".length)).split(",");
      device.calls.push(...procedures);
      if (device.cookie !== "new")
        return Response.json(
          procedures.map(() => refused),
          { status: 401 },
        );
      const data = (procedure: string) => (procedure === "me.get" ? member() : [staffNamed("Ravi")]);
      return Response.json(procedures.map((procedure) => ({ result: { data: data(procedure) } })));
    }),
  );
  return device;
}

/** The sign-in page, as it opens with a sign-out owed. */
function openSignInPage() {
  window.history.replaceState(null, "", "/sign-in");
  return render(
    <DataProviders>
      <p>Sign in</p>
    </DataProviders>,
  );
}

/**
 * The person signs in on that page, as the sign-in screen does, and the app opens its first page. Returns the calls
 * that first page made.
 */
async function signInAndOpenTheApp(device: ReturnType<typeof stubDevice>, signInPage: { unmount: () => void }) {
  const signedIn = await authClient.signInWithEmail({ email: "asha@example.in", password: "asha-password-1" });
  expect(signedIn.ok).toBe(true);
  await finishSignIn(new QueryClient(), "/", () => undefined);
  signInPage.unmount();
  window.history.replaceState(null, "", "/");
  const firstPage = device.calls.length;
  renderApp();
  return () => device.calls.slice(firstPage);
}

beforeEach(async () => {
  await deleteSavedCopies();
  window.localStorage.setItem("travel-crm.sign-out-owed", "1");
  forgetRenders();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem("travel-crm.sign-out-owed");
});

describe("signing in soon after signing out", () => {
  it("waits for the sign-out still being settled, so the new session keeps its cookie", async () => {
    const device = stubDevice("slowly");
    const signInPage = openSignInPage();
    await vi.waitFor(() => {
      expect(device.calls).toContain("sign-out with the old cookie");
    });
    const signingIn = signInAndOpenTheApp(device, signInPage);
    await pause(100);
    // The sign-in hasn't gone out: the old session's answer, which deletes the cookie, comes first.
    expect(device.calls).not.toContain("sign-in");
    device.release();
    await signingIn;
    expect(device.calls.indexOf("sign-in")).toBeGreaterThan(device.calls.indexOf("sign-out with the old cookie"));
    expect(await screen.findByText("Asha: Ravi")).toBeVisible();
    expect(device.cookie).toBe("new");
  });

  it("leaves nothing owed for its first page to sign the new session out with", async () => {
    const device = stubDevice("never, offline");
    const signInPage = openSignInPage();
    await vi.waitFor(() => {
      expect(device.calls).toContain("sign-out with the old cookie");
    });
    await pause(50);
    expect(isSignOutOwed()).toBe(true);
    // The connection comes back, with no "online" event yet, and the person signs in.
    device.signOut = "at once";
    const firstPageCalls = await signInAndOpenTheApp(device, signInPage);
    expect(isSignOutOwed()).toBe(false);
    expect(await screen.findByText("Asha: Ravi")).toBeVisible();
    expect(firstPageCalls().filter((call) => call.startsWith("sign-out"))).toEqual([]);
    expect(device.cookie).toBe("new");
  });
});
