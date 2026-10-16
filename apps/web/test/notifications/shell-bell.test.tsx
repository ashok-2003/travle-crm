// Where the bell sits in the app's frame: beside the organization's name at the top of the sidebar on wide screens,
// and in a bar above the page on phones, so the bottom bar keeps its destinations (DESIGN.md: 4-5, More included).
// CSS shows one or the other, so both are here. The account screen leads to the notification choices.
import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountScreen } from "@/account/account-screen";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DataProviders } from "@/data/providers";
import { locale, messages } from "@/i18n/messages";
import { MeProvider } from "@/session/me-context";
import { BottomBar } from "@/shell/bottom-bar";
import { AppSidebar } from "@/shell/sidebar";
import { TopBar } from "@/shell/top-bar";
import { renderScreen } from "../account/render";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const t = createTranslator({ locale, messages, namespace: "notifications.bell" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the bell in the app's frame", () => {
  it("sits in the sidebar and in the phone's top bar, leaving the bottom bar its destinations", async () => {
    screenIs("wide");
    stubApi({ "notifications.unreadCount": { data: 2 } });
    render(
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
        <DataProviders>
          <MeProvider me={member({ isOwner: true })}>
            {/* The frame as (app)/layout.tsx puts it together. */}
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <TopBar />
                <p>The page</p>
              </SidebarInset>
              <BottomBar />
            </SidebarProvider>
          </MeProvider>
        </DataProviders>
      </NextIntlClientProvider>,
    );
    const name = t("label", { count: 2 });
    const sidebar = document.querySelector<HTMLElement>("[data-slot=sidebar]");
    if (!sidebar) throw new Error("the sidebar is missing");
    expect(await within(sidebar).findByRole("button", { name })).toBeVisible();
    const topBar = within(screen.getByRole("banner"));
    expect(topBar.getByText("Sharma Travels")).toBeVisible();
    expect(await topBar.findByRole("button", { name })).toBeVisible();
    const [, bottomBar] = screen.getAllByRole("navigation", { name: messages.shell.navigation.label });
    if (!bottomBar) throw new Error("the bottom bar is missing");
    expect(within(bottomBar).queryByRole("button", { name })).toBeNull();
    expect(within(bottomBar).getAllByRole("link")).toHaveLength(4);
  });
});

describe("the account screen", () => {
  it("leads to the notification choices", () => {
    renderScreen(
      <MeProvider me={member()}>
        <AccountScreen />
      </MeProvider>,
    );
    expect(screen.getByRole("link", { name: messages.notifications.account.action })).toHaveAttribute(
      "href",
      "/account/notifications",
    );
  });
});
