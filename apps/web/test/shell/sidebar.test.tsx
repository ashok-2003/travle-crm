// The agency's sidebar: its logo at the top, or its name while it has none; destinations under their headings; and a
// button that folds it to its icons, each still named, and opens it again as the person left it.
import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppFrame } from "@/components/app-frame";
import { DataProviders } from "@/data/providers";
import { locale, messages } from "@/i18n/messages";
import { MeProvider } from "@/session/me-context";
import { AppSidebar } from "@/shell/sidebar";
import { screenIs } from "../organization/render";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { navigation } = messages.shell;

function renderSidebar(logo: Answer) {
  screenIs("wide");
  stubApi({ "notifications.unreadCount": { data: 0 }, "organization.logo.forShell": logo });
  render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <DataProviders>
        <MeProvider me={member({ isOwner: true })}>
          <AppFrame sidebar={<AppSidebar />} bottomBar={null} foldable>
            <p>The page</p>
          </AppFrame>
        </MeProvider>
      </DataProviders>
    </NextIntlClientProvider>,
  );
  const sidebar = document.querySelector<HTMLElement>("[data-slot=sidebar]");
  if (!sidebar) throw new Error("the sidebar is missing");
  return within(sidebar);
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "sidebar_state=; max-age=0; path=/";
});

describe("the agency's sidebar", () => {
  it("shows the agency's logo, named as the agency", async () => {
    const sidebar = renderSidebar({
      data: { url: "https://files.example/logo.png?signed", expiresAt: new Date().toISOString() },
    });
    const logo = await sidebar.findByRole("img", { name: "Sharma Travels" });
    expect(logo).toHaveAttribute("src", "https://files.example/logo.png?signed");
  });

  it("shows the agency's name while it has no logo", async () => {
    const sidebar = renderSidebar({ data: null });
    expect(await sidebar.findByText("Sharma Travels")).toBeVisible();
    expect(sidebar.queryByRole("img")).toBeNull();
  });

  it("lists the destinations under their headings", () => {
    const sidebar = renderSidebar({ data: null });
    for (const heading of Object.values(navigation.groups)) expect(sidebar.getByText(heading)).toBeVisible();
  });

  it("folds to its icons and opens again, remembering the choice", async () => {
    const sidebar = renderSidebar({ data: null });
    const frame = document.querySelector("[data-slot=sidebar]");
    await userEvent.click(sidebar.getByRole("button", { name: navigation.collapse }));
    expect(frame).toHaveAttribute("data-state", "collapsed");
    expect(document.cookie).toContain("sidebar_state=false");
    await userEvent.click(screen.getByRole("button", { name: navigation.expand }));
    expect(frame).toHaveAttribute("data-state", "expanded");
  });

  it("opens folded when it was left folded", () => {
    document.cookie = "sidebar_state=false; path=/";
    renderSidebar({ data: null });
    expect(document.querySelector("[data-slot=sidebar]")).toHaveAttribute("data-state", "collapsed");
  });
});
