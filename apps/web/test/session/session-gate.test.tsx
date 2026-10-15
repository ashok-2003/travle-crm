// The way into the app shell: a member gets the shell, a pending password change or two-factor setup sends the
// person to take it, platform staff are told this app isn't theirs, and a me.get that fails says so with a Retry.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
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

function renderGate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          <SessionGate>
            <Shell />
          </SessionGate>
        </TRPCProvider>
      </QueryClientProvider>
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

  it("tells platform staff this app isn't theirs, and lets them sign out", async () => {
    stubApi({ "me.get": { data: { ...member(), isPlatformAdmin: true, organization: null, member: null } } });
    renderGate();
    expect(await screen.findByText(session.notStaff)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.shell.navigation.signOut })).toBeVisible();
    expect(screen.queryByText(/Shell for/)).toBeNull();
  });

  it("says when me.get didn't load, with a way to try again", async () => {
    stubApi({ "me.get": "offline" });
    renderGate();
    expect(await screen.findByText(session.loadFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
