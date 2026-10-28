// The dashboard on home: the last 30 days at first, another period when picked; the key figures with how each is
// counted; where the period's leads came from and stand now; the team for a role that sees everyone's; a plain line
// when nothing came in; and a failure that leaves the rest of home working, with Try again.
import type { Dashboard as DashboardFigures } from "@travel-crm/contracts/insights";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/dashboard/dashboard";
import { messages } from "@/i18n/messages";
import { formatCalendarDay } from "@/lib/format";
import { fakeApi } from "../organization/api";
import { renderAs, screenIs } from "../organization/render";

const { dashboard: words } = messages;

const figures: DashboardFigures = {
  scope: "all",
  from: "2026-09-18",
  to: "2026-10-17",
  totals: {
    newLeads: 4,
    contacted: 2,
    medianFirstReplyMinutes: 20,
    quotesSent: 1,
    won: 2,
    newLeadsWon: 1,
    open: 3,
    overdue: 1,
  },
  previous: { newLeads: 2, contacted: 1, medianFirstReplyMinutes: 30, quotesSent: 1, won: 1, newLeadsWon: 1 },
  perDay: [
    { day: "2026-10-16", leads: 3 },
    { day: "2026-10-17", leads: 1 },
  ],
  bySource: [
    { source: "phone_call", leads: 3, won: 1 },
    { source: "google_sheet", leads: 1, won: 0 },
  ],
  byStage: [
    { stage: "new", leads: 2 },
    { stage: "contacted", leads: 1 },
    { stage: "won", leads: 1 },
  ],
  topDestinations: [{ name: "Kashmir", leads: 2 }],
  responseTimes: [
    { bucket: "under15m", leads: 1 },
    { bucket: "waiting", leads: 2 },
  ],
  team: [
    {
      userId: "0199a000-0000-7000-8000-000000000001",
      name: "Priya Shah",
      leads: 3,
      contacted: 1,
      won: 0,
      medianFirstReplyMinutes: null,
      overdue: 0,
      salesPaise: 0,
    },
    {
      userId: "0199a000-0000-7000-8000-000000000002",
      name: null,
      leads: 1,
      contacted: 1,
      won: 1,
      medianFirstReplyMinutes: null,
      overdue: 0,
      salesPaise: 0,
    },
  ],
};

/** jsdom has no layout: Recharts' ResponsiveContainer asks for ResizeObserver. */
beforeEach(() => {
  screenIs("wide");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
});

/** Renders the dashboard and answers its first call with these figures. */
async function shown(answer: DashboardFigures = figures) {
  const api = fakeApi();
  renderAs(<Dashboard />);
  await waitFor(() => {
    expect(api.calls.some((call) => call.path === "insights.dashboard")).toBe(true);
  });
  const call = api.calls.find((pending) => pending.path === "insights.dashboard");
  call?.answer(answer);
  return { api, call };
}

/** A key figure's group: its label, then its value and how it moved. */
const figureOf = (label: string) => screen.getByRole("group", { name: label });
const shows = (label: string, value: string) => {
  expect(figureOf(label)).toHaveTextContent(value);
};

describe("Dashboard", () => {
  it("asks for the last 30 days, and shows the key figures as counted", async () => {
    const { call } = await shown();
    expect(call?.input).toEqual({ range: "30d" });
    expect(await screen.findByRole("heading", { name: words.title })).toBeVisible();
    expect(
      await screen.findByText(`${formatCalendarDay("2026-09-18")} to ${formatCalendarDay("2026-10-17")}`),
    ).toBeVisible();
    shows(words.kpis.newLeads.label, "4");
    shows(words.kpis.contacted.label, "50%");
    shows(words.kpis.firstReply.label, "20 min");
    shows(words.kpis.conversion.label, "25%");
    // Twice the new leads of the period before.
    shows(words.kpis.newLeads.label, "100% up");
    expect(screen.getByRole("button", { name: `What does ${words.kpis.won.label} mean?` })).toBeVisible();
  });

  it("shows the eight figures in one card with no icon tiles, and a change only where there is a comparison", async () => {
    await shown({ ...figures, previous: { ...figures.previous, newLeads: 0, won: 0 } });
    const strip = await screen.findByRole("region", { name: words.kpis.label });
    for (const key of [
      "newLeads",
      "contacted",
      "firstReply",
      "quotesSent",
      "won",
      "conversion",
      "open",
      "overdue",
    ] as const) {
      const label = words.kpis[key].label;
      expect(within(strip).getByRole("group", { name: label })).toBeVisible();
      expect(within(strip).getByRole("button", { name: `What does ${label} mean?` })).toBeVisible();
    }
    expect(strip).toHaveAttribute("data-slot", "card");
    // The only icons are the info hints' own.
    expect(strip.querySelectorAll("svg").length).toBe(strip.querySelectorAll("button svg").length);
    expect(figureOf(words.kpis.newLeads.label)).not.toHaveTextContent(words.kpis.vsBefore);
    expect(screen.queryByText(/Nothing to compare/)).toBeNull();
  });

  it("breaks the period's leads down by source, stage, wait and destination", async () => {
    await shown();
    expect(await screen.findByText("Phone call")).toBeVisible();
    expect(screen.getByText("1 won")).toBeVisible();
    expect(screen.getByText(words.responseTimes.buckets.waiting)).toBeVisible();
    expect(screen.getByText("Kashmir")).toBeVisible();
    // The chart's numbers, for screen readers.
    expect(screen.getByRole("table", { name: words.perDay.table })).toBeInTheDocument();
  });

  it("lists the team for a role that sees everyone's leads, naming who has left", async () => {
    await shown();
    const team = within(await screen.findByRole("table", { name: words.team.title }));
    expect(team.getByText("Priya Shah")).toBeVisible();
    expect(team.getByText(words.team.formerStaff)).toBeVisible();
  });

  it("asks again for the period picked", async () => {
    const { api } = await shown();
    await userEvent.click(await screen.findByRole("radio", { name: words.range["7d"] }));
    await waitFor(() => {
      expect(api.last()).toMatchObject({ path: "insights.dashboard", input: { range: "7d" } });
    });
  });

  it("says so plainly when no lead came in, and titles a salesperson's own figures", async () => {
    await shown({ ...figures, scope: "own", team: [], totals: { ...figures.totals, newLeads: 0 } });
    expect(await screen.findByText(words.empty)).toBeVisible();
    expect(screen.getByRole("heading", { name: words.titleOwn })).toBeVisible();
    expect(screen.queryByText("Phone call")).toBeNull();
  });

  it("says when it didn't load, with Try again", async () => {
    const api = fakeApi();
    renderAs(<Dashboard />);
    // These tests' query cache never retries: the first fault is the last.
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    api.last().fail();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
