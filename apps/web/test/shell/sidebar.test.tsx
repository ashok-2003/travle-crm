// The agency's sidebar (web revamp part 5): a rail of icons, each named, that opens over the page on hover and on the
// keyboard's focus and shuts when the pointer leaves or on Escape; a touch screen opens it with its top button and
// shuts it with a tap outside or on a destination. The agency's mark and name and the bell at its top, the
// destinations in three groups, the current page marked, the counts of waiting work, and the person's menu.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppFrame } from "@/components/app-frame";
import { DataProviders } from "@/data/providers";
import { locale, messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { MeProvider } from "@/session/me-context";
import { AppSidebar } from "@/shell/sidebar";
import { screenIs } from "../organization/render";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import { busyDay } from "../today/records";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

const { navigation } = messages.shell;
const globalsCss = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

const unreadChats = {
  waiting: 0,
  late: 0,
  unread: 3,
  mine: 0,
  unassigned: 0,
  snoozed: 0,
  stages: { new: 0, contacted: 0, quote_sent: 0, booking_requested: 0, won: 0 },
};

function renderSidebar({ logo = { data: null } }: { logo?: Answer } = {}) {
  screenIs("wide");
  stubApi({
    "notifications.unreadCount": { data: 0 },
    "organization.logo.forShell": logo,
    "salesInbox.summary": { data: unreadChats },
    "today.summary": { data: busyDay },
    "auth/sign-out": { data: { success: true } },
  });
  render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <DataProviders>
        <MeProvider me={member({ isOwner: true })}>
          <AppFrame sidebar={<AppSidebar />} bottomBar={null}>
            <p>The page</p>
          </AppFrame>
        </MeProvider>
      </DataProviders>
    </NextIntlClientProvider>,
  );
  const panel = document.querySelector<HTMLElement>("[data-slot=aceternity-sidebar]");
  if (!panel) throw new Error("the sidebar is missing");
  return { panel, sidebar: within(panel) };
}

// Radix measures its menus and tooltips; jsdom can't.
beforeEach(() => {
  const noop = () => undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    },
  );
  Object.assign(Element.prototype, { scrollIntoView: noop, hasPointerCapture: () => false });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

/** A finger's tap: no hover comes before it. */
const tap = (target: Element) => userEvent.pointer({ keys: "[TouchA]", target });

describe("the agency's sidebar", () => {
  it("shows the agency's logo in its mark, beside its name", async () => {
    imagesLoad();
    const { panel, sidebar } = renderSidebar({
      logo: { data: { url: logoLink, expiresAt: new Date().toISOString() } },
    });
    expect(sidebar.getByText("Sharma Travels")).toBeInTheDocument();
    await waitFor(() => {
      expect(panel.querySelector("[data-slot=avatar] img")).toHaveAttribute("src", logoLink);
    });
  });

  it("marks the agency with its first letter on the brand's green while it has no logo", () => {
    const { panel } = renderSidebar();
    const mark = panel.querySelector("[data-slot=avatar-fallback]");
    expect(mark).toHaveTextContent("S");
    expect(mark).toHaveClass("bg-sidebar-fill", "text-sidebar-ink");
  });

  it("lists the destinations in three groups, without headings", () => {
    const { sidebar } = renderSidebar();
    const lists = within(sidebar.getByRole("navigation", { name: navigation.label })).getAllByRole("list");
    const names = lists.map((list) =>
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent),
    );
    expect(names).toEqual([
      [navigation.home, navigation.today, navigation.followUps, navigation.leads, navigation.inbox],
      expect.arrayContaining([navigation.aiAgent, navigation.quotes, navigation.payments, navigation.reports]),
      [navigation.staff, navigation.roles, navigation.settings, navigation.audit],
    ]);
    for (const heading of ["Work", "Team", "Manage"]) expect(sidebar.queryByText(heading)).toBeNull();
  });

  it("marks the current page in a matte neon: solid action blue, white words, a soft blue glow", () => {
    const { sidebar } = renderSidebar();
    const home = sidebar.getByRole("link", { name: navigation.home });
    expect(home).toHaveAttribute("aria-current", "page");
    // jsdom draws no CSS: the classes the current item wears, keyed on aria-current, and what the agency's sidebar sets
    // their tokens to.
    for (const style of [
      "aria-[current=page]:bg-sidebar-accent",
      "aria-[current=page]:text-sidebar-accent-foreground",
      "aria-[current=page]:shadow-[0_4px_14px_-2px_color-mix(in_srgb,var(--sidebar-accent)_40%,transparent)]",
    ]) {
      expect(home.className).toContain(style);
    }
    const agencyTokens = /\[data-slot="aceternity-sidebar"\] \{([^}]*)\}/.exec(globalsCss)?.[1] ?? "";
    expect(agencyTokens).toContain("--sidebar-accent: var(--brand-action);");
    expect(agencyTokens).toContain("--sidebar-accent-foreground: var(--brand-on-action);");
    const leads = sidebar.getByRole("link", { name: navigation.leads });
    expect(leads).not.toHaveAttribute("aria-current");
    expect(document.querySelector("[data-current]")).toBeNull();
  });

  it("counts the work waiting: the Inbox's unread chats in violet, My tasks' in red, said after their names", async () => {
    const { sidebar } = renderSidebar();
    const inbox = await sidebar.findByRole("link", { name: navigation.inbox, description: "3 unread chats" });
    expect(within(inbox).getByText("3")).toHaveClass("bg-people-tint", "text-people-tint-ink");
    expect(inbox.querySelector("[data-slot=sidebar-dot]")).toHaveClass("bg-people");
    const today = await sidebar.findByRole("link", { name: navigation.today, description: "8 things to do today" });
    expect(within(today).getByText("8")).toHaveClass("bg-status-bad-fill", "text-status-bad-ink");
    expect(sidebar.getByRole("link", { name: navigation.leads })).not.toHaveAccessibleDescription();
  });

  it("is the rail at rest, every icon named for a screen reader", () => {
    const { panel, sidebar } = renderSidebar();
    expect(panel).toHaveAttribute("data-state", "closed");
    for (const link of sidebar.getAllByRole("link")) expect(link).toHaveAccessibleName();
    for (const button of sidebar.getAllByRole("button")) expect(button).toHaveAccessibleName();
    expect(sidebar.getByRole("link", { name: navigation.payments })).toBeVisible();
  });

  it("opens over the page while the pointer is on it, and shuts when it leaves", async () => {
    const { panel } = renderSidebar();
    await userEvent.hover(panel);
    expect(panel).toHaveAttribute("data-state", "open");
    await userEvent.unhover(panel);
    expect(panel).toHaveAttribute("data-state", "closed");
  });

  it("shows no tooltip once a peek ends: the names were in the open panel", async () => {
    const { panel, sidebar } = renderSidebar();
    const leads = sidebar.getByRole("link", { name: navigation.leads });
    await userEvent.hover(leads);
    expect(panel).toHaveAttribute("data-state", "open");
    await userEvent.unhover(leads);
    await userEvent.unhover(panel);
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shuts when a destination is chosen, so the page it opens is clear, and opens again when the pointer comes back", async () => {
    const { panel, sidebar } = renderSidebar();
    await userEvent.hover(panel);
    const leads = sidebar.getByRole("link", { name: navigation.leads });
    // jsdom can't follow a link.
    leads.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await userEvent.click(leads);
    expect(panel).toHaveAttribute("data-state", "closed");
    await userEvent.unhover(panel);
    await userEvent.hover(panel);
    expect(panel).toHaveAttribute("data-state", "open");
  });

  it("opens on the keyboard's focus, shuts on Escape, and then names its icons in tooltips", async () => {
    const { panel, sidebar } = renderSidebar();
    await userEvent.tab(); // the skip link
    await userEvent.tab();
    expect(panel).toHaveAttribute("data-state", "open");
    // Its first button, the touch screen's, now offers to shut it.
    expect(sidebar.getByRole("button", { name: navigation.closeSidebar })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(panel).toHaveAttribute("data-state", "closed");
    await userEvent.tab();
    expect(sidebar.getByRole("button", { name: /^Notifications/ })).toHaveFocus();
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(await screen.findByRole("tooltip")).toHaveTextContent(navigation.notifications);
  });

  it("shuts when the keyboard's focus leaves it for the page", async () => {
    const { panel } = renderSidebar();
    await userEvent.tab(); // the skip link
    await userEvent.tab();
    expect(panel).toHaveAttribute("data-state", "open");
    // A click where nothing takes the focus, which goes to nothing.
    await userEvent.click(document.body);
    expect(panel).toHaveAttribute("data-state", "closed");
    // The focus is gone with it: a later peek with the pointer ends when the pointer leaves.
    await userEvent.hover(panel);
    await userEvent.unhover(panel);
    expect(panel).toHaveAttribute("data-state", "closed");
  });

  it("opens from its top button on a touch screen, and shuts at a tap outside", async () => {
    const { panel, sidebar } = renderSidebar();
    await tap(sidebar.getByRole("button", { name: navigation.openSidebar }));
    expect(panel).toHaveAttribute("data-state", "open");
    expect(sidebar.getByRole("button", { name: navigation.closeSidebar })).toBeInTheDocument();
    await tap(screen.getByText("The page"));
    expect(panel).toHaveAttribute("data-state", "closed");
  });

  it("shuts at a tap on a destination", async () => {
    const { panel, sidebar } = renderSidebar();
    await tap(sidebar.getByRole("button", { name: navigation.openSidebar }));
    const leads = sidebar.getByRole("link", { name: navigation.leads });
    // jsdom can't follow a link.
    leads.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await tap(leads);
    expect(panel).toHaveAttribute("data-state", "closed");
  });

  it("opens the person's menu, with their account and sign-out, and stays open while it is", async () => {
    const { panel, sidebar } = renderSidebar();
    // The open menu makes the page beneath it inert, as Radix's menus do.
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
    await user.hover(panel);
    await user.click(sidebar.getByRole("button", { name: "Asha: your account and sign-out" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: navigation.account })).toHaveAttribute("href", "/account");
    await user.unhover(panel);
    expect(panel).toHaveAttribute("data-state", "open");
    await user.click(within(menu).getByRole("menuitem", { name: navigation.signOut }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("/sign-in");
    });
  });
});
