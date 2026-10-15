// The console's dashboard (spec 7.4): every organization a page at a time, oldest first, with its status as a dot and
// a word, days left, seats used of the limit, last activity and this month's usage, each leading to the
// organization's page; and honest loading, empty and error states.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleProviders } from "@/console/data/console-providers";
import { DashboardScreen } from "@/console/dashboard/dashboard-screen";
import { PLATFORM_TIME_ZONE } from "@/console/platform-time-zone";
import { locale, messages } from "@/i18n/messages";
import { formatDay } from "@/lib/format";
import { stubApi } from "../support/api-stub";
import { screenIs } from "../organization/render";

const { dashboard, status } = messages.console;

const lastActiveAt = "2026-10-14T06:30:00.000Z";

function overview(overrides: Partial<OrganizationOverview> = {}): OrganizationOverview {
  return {
    organizationId: "0199a000-0000-7000-8000-000000000002",
    name: "Sharma Travels",
    code: "SHARMA",
    status: "active",
    planName: "Growth",
    nextChangeOn: "2026-10-27",
    daysLeft: 12,
    seats: { used: 3, limit: 10 },
    storage: { usedBytes: 0, limitBytes: null },
    lastActiveAt,
    thisMonth: { changes: 1234, documentsIssued: 5 },
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ConsoleProviders>
        <DashboardScreen />
      </ConsoleProviders>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardScreen", () => {
  it("shows each organization's row in a table on wide screens, leading to its page", async () => {
    screenIs("wide");
    stubApi({ "platform.dashboard.organizations": { data: { organizations: [overview()], nextCursor: null } } });
    renderDashboard();
    const link = await screen.findByRole("link", { name: /Sharma Travels/ });
    expect(link).toHaveAttribute("href", "/console/organizations/0199a000-0000-7000-8000-000000000002");
    const row = within(link.closest("tr") ?? document.body);
    expect(row.getByText("SHARMA")).toBeVisible();
    expect(row.getByText(status.active)).toBeVisible();
    expect(row.getByText("12 days")).toBeVisible();
    expect(row.getByText("3 of 10")).toBeVisible();
    expect(row.getByText(formatDay(new Date(lastActiveAt), { timeZone: PLATFORM_TIME_ZONE }))).toBeVisible();
    expect(row.getByText("1,234")).toBeVisible();
    expect(row.getByText("5")).toBeVisible();
    expect(screen.queryByRole("button", { name: dashboard.showMore })).toBeNull();
  });

  it("says what isn't there: no subscription, no limit, no change due, never active", async () => {
    screenIs("wide");
    const bare = overview({
      status: null,
      planName: null,
      daysLeft: null,
      nextChangeOn: null,
      seats: { used: 1, limit: null },
      lastActiveAt: null,
    });
    stubApi({ "platform.dashboard.organizations": { data: { organizations: [bare], nextCursor: null } } });
    renderDashboard();
    const row = within((await screen.findByRole("link", { name: /Sharma Travels/ })).closest("tr") ?? document.body);
    expect(row.getByText(status.none)).toBeVisible();
    expect(row.getByText(dashboard.noChangeDue)).toBeVisible();
    expect(row.getByText("1, no limit")).toBeVisible();
    expect(row.getByText(dashboard.neverActive)).toBeVisible();
  });

  it("lists organizations on a phone, name and status first", async () => {
    screenIs("phone");
    stubApi({ "platform.dashboard.organizations": { data: { organizations: [overview()], nextCursor: null } } });
    renderDashboard();
    const link = await screen.findByRole("link", { name: /Sharma Travels/ });
    expect(link).toHaveAttribute("href", "/console/organizations/0199a000-0000-7000-8000-000000000002");
    expect(within(link).getByText(status.active)).toBeVisible();
    expect(within(link).getByText("3 of 10")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the next page below the first when asked", async () => {
    screenIs("wide");
    const first = overview({ organizationId: "0199a000-0000-7000-8000-000000000011", name: "Sharma Travels" });
    const second = overview({ organizationId: "0199a000-0000-7000-8000-000000000012", name: "Iyer Holidays" });
    const api = stubApi({
      "platform.dashboard.organizations": { data: { organizations: [first], nextCursor: first.organizationId } },
    });
    renderDashboard();
    await screen.findByRole("link", { name: /Sharma Travels/ });
    api.answer("platform.dashboard.organizations", { data: { organizations: [second], nextCursor: null } });
    await userEvent.click(screen.getByRole("button", { name: dashboard.showMore }));
    expect(await screen.findByRole("link", { name: /Iyer Holidays/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Sharma Travels/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: dashboard.showMore })).toBeNull();
  });

  it("asks for the next page after the last organization of the page before", async () => {
    screenIs("wide");
    const first = overview({ organizationId: "0199a000-0000-7000-8000-000000000011" });
    const api = stubApi({
      "platform.dashboard.organizations": { data: { organizations: [first], nextCursor: first.organizationId } },
    });
    renderDashboard();
    await screen.findByRole("link", { name: /Sharma Travels/ });
    api.answer("platform.dashboard.organizations", { data: { organizations: [], nextCursor: null } });
    await userEvent.click(screen.getByRole("button", { name: dashboard.showMore }));
    await vi.waitFor(() => {
      expect(inputsSent()).toEqual([{ limit: 25 }, { limit: 25, after: first.organizationId }]);
    });
  });

  it("says when there are no organizations yet, and leads to onboarding the first", async () => {
    screenIs("wide");
    stubApi({ "platform.dashboard.organizations": { data: { organizations: [], nextCursor: null } } });
    renderDashboard();
    expect(await screen.findByText(dashboard.empty)).toBeVisible();
    expect(screen.getByRole("link", { name: dashboard.onboardFirst })).toHaveAttribute(
      "href",
      "/console/organizations/new",
    );
  });

  it("says when the organizations didn't load, and loads them on Try again", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.dashboard.organizations": { status: 403 } });
    renderDashboard();
    expect(await screen.findByText(dashboard.loadFailed)).toBeVisible();
    api.answer("platform.dashboard.organizations", { data: { organizations: [overview()], nextCursor: null } });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("link", { name: /Sharma Travels/ })).toBeVisible();
  });
});

/** The inputs the dashboard's calls sent, read from the stubbed fetch's URLs. */
function inputsSent(): unknown[] {
  const fetch = vi.mocked(globalThis.fetch);
  return fetch.mock.calls.map(([input]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const batch = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, unknown>;
    return batch["0"];
  });
}
