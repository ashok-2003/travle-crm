// The way into the app shell: a member gets the shell, a pending password change or two-factor setup sends the
// person to take it (but support signed in as them is told only the member can, with the way to stop), platform staff
// go to the console, anyone else is told this app isn't theirs, and a me.get that fails says so with a Retry.
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataProviders } from "@/data/providers";
import { locale, messages } from "@/i18n/messages";
import { replacePage } from "@/lib/navigate";
import { useMe } from "@/session/me-context";
import { SessionGate } from "@/session/session-gate";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const { session } = messages.shell;

function Shell() {
  return <p>Shell for {useMe().user.name}</p>;
}

/** The gate inside the app's own data layer, which the not-staff screen's sign-out button goes through. */
function renderGate() {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DataProviders>
        <SessionGate>
          <Shell />
        </SessionGate>
      </DataProviders>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(replacePage).mockReset();
});

describe("SessionGate", () => {
  it("opens the shell for a member", async () => {
    stubApi({ "me.get": { data: member() } });
    renderGate();
    expect(await screen.findByText("Shell for Asha")).toBeVisible();
  });

  it("sends a person with a pending step to take it, and shows nothing of the shell", async () => {
    stubApi({ "me.get": { data: { ...member(), pendingStep: "CHANGE_PASSWORD" } } });
    renderGate();
    await vi.waitFor(() => {
      expect(replacePage).toHaveBeenCalledWith("/change-password");
    });
    expect(screen.queryByText(/Shell for/)).toBeNull();
  });

  it.each(["CHANGE_PASSWORD", "SET_UP_TWO_FACTOR"] as const)(
    "tells support signed in as a member with %s pending that only the member can take it, with Stop",
    async (step) => {
      stubApi({
        "me.get": {
          data: { ...member({ impersonatedBy: "0199a000-0000-7000-8000-00000000000a" }), pendingStep: step },
        },
      });
      renderGate();
      expect(await screen.findByText(session.impersonatedStep[step].replace("{name}", "Asha"))).toBeVisible();
      expect(screen.getByRole("button", { name: messages.shell.banners.stop })).toBeVisible();
      expect(replacePage).not.toHaveBeenCalled();
      expect(screen.queryByText(/Shell for/)).toBeNull();
    },
  );

  it("sends platform staff to the console, and shows nothing of the shell", async () => {
    stubApi({ "me.get": { data: { ...member(), isPlatformAdmin: true, organization: null, member: null } } });
    renderGate();
    await vi.waitFor(() => {
      expect(replacePage).toHaveBeenCalledWith("/console");
    });
    expect(screen.queryByText(/Shell for/)).toBeNull();
    expect(screen.queryByText(session.notStaff)).toBeNull();
  });

  it("tells someone in no organization this app isn't theirs, and lets them sign out", async () => {
    stubApi({ "me.get": { data: { ...member(), organization: null, member: null } } });
    renderGate();
    expect(await screen.findByText(session.notStaff)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.shell.navigation.signOut })).toBeVisible();
    expect(screen.queryByText(/Shell for/)).toBeNull();
  });

  it("says the api is starting up while it wakes, then opens the shell", async () => {
    const api = stubApi({ "me.get": "offline" });
    renderGate();
    expect(await screen.findByText(messages.common.serverWaking)).toBeVisible();
    expect(screen.queryByText(session.loadFailed)).toBeNull();
    api.answer("me.get", { data: member() });
    // A waking api is asked again every three seconds.
    expect(await screen.findByText("Shell for Asha", undefined, { timeout: 5_000 })).toBeVisible();
  });

  it("says when me.get didn't load, with a way to try again", async () => {
    stubApi({ "me.get": { status: 500 } });
    renderGate();
    // A server fault is tried three times, a second and then two apart.
    expect(await screen.findByText(session.loadFailed, undefined, { timeout: 5_000 })).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
