// The console's frame: its destinations by the person's level (the sidebar on wide screens, the bottom bar and More on
// phones; CSS shows one, so both are here), who is signed in and at which level, and signing out, which empties the
// console's cache and leaves as the app's own sign-out does (data/session.ts).
import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleShell } from "@/console/shell/console-shell";
import { StaffProvider } from "@/console/session/staff-context";
import { DataProviders } from "@/data/providers";
import { locale, messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { stubApi } from "../support/api-stub";
import { screenIs } from "../organization/render";
import { platformStaff } from "../support/platform-staff";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/console" }));

const { navigation } = messages.console;

function renderShell(level: "support" | "super-admin", queryClient = new QueryClient()) {
  screenIs("wide");
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DataProviders>
        <QueryClientProvider client={queryClient}>
          <StaffProvider staff={platformStaff(level)}>
            <ConsoleShell>
              <p>The page</p>
            </ConsoleShell>
          </StaffProvider>
        </QueryClientProvider>
      </DataProviders>
    </NextIntlClientProvider>,
  );
}

/** The registry's sidebar, which is a plain block rather than a landmark. */
async function findSidebar(): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const sidebar = document.querySelector<HTMLElement>("[data-slot=sidebar]");
    if (!sidebar) throw new Error("the sidebar is missing");
    return sidebar;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(loadPage).mockReset();
});

describe("ConsoleShell", () => {
  it("shows a super admin every destination, the page, and who is signed in at which level", async () => {
    stubApi({});
    renderShell("super-admin");
    const sidebar = within(await findSidebar());
    for (const destination of ["home", "onboard", "plans", "jobs", "log", "staff"] as const) {
      expect(sidebar.getByRole("link", { name: navigation[destination] })).toBeVisible();
    }
    expect(sidebar.getByRole("link", { name: navigation.home })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("The page")).toBeVisible();
    expect(screen.getByText("Kavita Rao")).toBeVisible();
    expect(screen.getByText(messages.console.levels["super-admin"])).toBeVisible();
  });

  it("shows support no Staff destination", async () => {
    stubApi({});
    renderShell("support");
    const sidebar = within(await findSidebar());
    expect(sidebar.queryByRole("link", { name: navigation.staff })).toBeNull();
    expect(screen.getByText(messages.console.levels.support)).toBeVisible();
  });

  it("lets the skip link land on the page itself, past what sits above it", async () => {
    stubApi({});
    renderShell("support");
    await findSidebar();
    const skip = screen.getByRole("link", { name: messages.common.skipToContent });
    const target = document.getElementById((skip.getAttribute("href") ?? "").slice(1));
    expect(target).toHaveTextContent("The page");
    expect(target?.contains(skip)).toBe(false);
    expect(target).toHaveAttribute("tabindex", "-1");
  });

  it("names the dashboard Home in the phone's bar", async () => {
    stubApi({});
    renderShell("support");
    await findSidebar();
    const bar = document.querySelector<HTMLElement>("[data-phone-navigation]");
    if (!bar) throw new Error("the phone's bar is missing");
    expect(within(bar).getByRole("link", { name: navigation.homeShort })).toHaveAttribute("href", "/console");
  });

  it("keeps the rest in More on a phone, Staff among them for a super admin", async () => {
    stubApi({});
    renderShell("super-admin");
    await userEvent.click(await screen.findByRole("button", { name: navigation.more }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("link", { name: navigation.log })).toBeVisible();
    expect(within(sheet).getByRole("link", { name: navigation.staff })).toBeVisible();
    expect(within(sheet).getByRole("button", { name: navigation.signOut })).toBeVisible();
  });

  it("signs out: the console's cache empties, the api is told, and the sign-in page loads", async () => {
    const api = stubApi({ "auth/sign-out": { data: {} } });
    const queryClient = new QueryClient();
    queryClient.setQueryData(["platform", "dashboard"], { organizations: ["Sharma Travels"] });
    renderShell("support", queryClient);
    const sidebar = await findSidebar();
    await userEvent.click(within(sidebar).getByRole("button", { name: navigation.signOut }));
    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/sign-in");
    });
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    await vi.waitFor(() => {
      expect(api.calls).toContain("auth/sign-out");
    });
  });
});
