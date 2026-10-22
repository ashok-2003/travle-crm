// The agency's sidebar: its logo at the top, or its name while it has none; destinations under their headings; and a
// button that folds it to its icons, each still named, and opens it again as the person left it.
import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const logoLink = "https://files.example/logo.png?signed";

/** jsdom loads no images; Radix's avatar shows one only once the browser says it is complete. */
function imagesLoad() {
  vi.stubGlobal(
    "Image",
    class extends EventTarget {
      complete = true;
      naturalWidth = 1;
      crossOrigin: string | null = null;
      referrerPolicy = "";
      src = "";
    },
  );
}

const foldedMark = () => {
  const mark = document.querySelector<HTMLElement>("[data-slot=sidebar] [data-slot=avatar]");
  if (!mark) throw new Error("the folded mark is missing");
  return mark;
};

describe("the agency's sidebar", () => {
  it("shows the agency's logo, named as the agency", async () => {
    const sidebar = renderSidebar({ data: { url: logoLink, expiresAt: new Date().toISOString() } });
    await waitFor(() => {
      const logos = sidebar.getAllByRole("img", { name: "Sharma Travels" });
      expect(logos.some((logo) => logo.getAttribute("src") === logoLink)).toBe(true);
    });
  });

  it("keeps the logo, small and square, when folded to its icons", async () => {
    imagesLoad();
    const sidebar = renderSidebar({ data: { url: logoLink, expiresAt: new Date().toISOString() } });
    await userEvent.click(sidebar.getByRole("button", { name: navigation.collapse }));
    const mark = foldedMark();
    expect(mark).toHaveAccessibleName("Sharma Travels");
    expect(mark).toHaveClass("group-data-[collapsible=icon]:flex");
    await waitFor(() => expect(mark.querySelector("img")).toHaveAttribute("src", logoLink));
  });

  it("shows the agency's first letter when folded and it has no logo", async () => {
    const sidebar = renderSidebar({ data: null });
    await userEvent.click(sidebar.getByRole("button", { name: navigation.collapse }));
    const mark = foldedMark();
    expect(mark).toHaveAccessibleName("Sharma Travels");
    expect(mark).toHaveTextContent("S");
    expect(mark.querySelector("img")).toBeNull();
  });

  it("shows the agency's name while it has no logo", async () => {
    const sidebar = renderSidebar({ data: null });
    expect(await sidebar.findByText("Sharma Travels")).toBeVisible();
    expect(document.querySelector("[data-slot=sidebar] img")).toBeNull();
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
