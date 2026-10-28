// The lead flow on Reports (it was Home's dashboard): the period Reports picked, new leads by day, where they stand now and
// how long they waited; a plain line when nothing came in; and a failure that leaves the rest of Reports working, with
// Try again.
import type { Dashboard as DashboardFigures } from "@travel-crm/contracts/insights";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeadFlow } from "@/dashboard/lead-flow";
import { messages } from "@/i18n/messages";
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
    },
    {
      userId: "0199a000-0000-7000-8000-000000000002",
      name: null,
      leads: 1,
      contacted: 1,
      won: 1,
      medianFirstReplyMinutes: null,
      overdue: 0,
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

/** Renders the lead flow and answers its first call with these figures. */
async function shown(answer: DashboardFigures = figures, range: "7d" | "30d" = "30d") {
  const api = fakeApi();
  renderAs(<LeadFlow range={range} />);
  await waitFor(() => {
    expect(api.calls.some((call) => call.path === "insights.dashboard")).toBe(true);
  });
  const call = api.calls.find((pending) => pending.path === "insights.dashboard");
  call?.answer(answer);
  return { api, call };
}

describe("LeadFlow", () => {
  it("asks for the period Reports picked, and breaks the period's leads down by day, stage and wait", async () => {
    const { call } = await shown(figures, "7d");
    expect(call?.input).toEqual({ range: "7d" });
    expect(await screen.findByText(words.responseTimes.buckets.waiting)).toBeVisible();
    // The chart's numbers, for screen readers.
    expect(screen.getByRole("table", { name: words.perDay.table })).toBeInTheDocument();
  });

  it("says so plainly when no lead came in", async () => {
    await shown({ ...figures, totals: { ...figures.totals, newLeads: 0 } });
    expect(await screen.findByText(words.empty)).toBeVisible();
  });

  it("says when it didn't load, with Try again", async () => {
    const api = fakeApi();
    renderAs(<LeadFlow range="30d" />);
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    api.last().fail();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
