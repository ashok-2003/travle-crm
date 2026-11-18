// Home's day (Task 11): Your tasks today, Hot leads to call, Departures leaving soon, AI insights and Needs your
// attention, in that order under the leads card, each left out for a member the role or plan can't show it to.
import type { HotLead } from "@travel-crm/contracts/sales";
import type { TodayItem } from "@travel-crm/contracts/today";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(app)/dashboard/page";
import { messages } from "@/i18n/messages";
import type { SignedInMember } from "@/session/me-context";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import { priyaDue, rahulNew, snehaOverdue, vikramOverdue } from "../today/records";
import { breakdown, seedDepartures, seedTasks, sentBodies } from "./stages";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

const h = messages.home;

const departure: Extract<TodayItem, { kind: "departure" }> = {
  kind: "departure",
  departureId: "0199e7a0-0000-7000-8000-0000000000d1",
  title: "Kerala backwaters batch",
  startDate: "2026-11-02",
  sold: 8,
  seatsTotal: 12,
  reasons: [],
};

const hotLead = (index: number): HotLead => ({
  leadId: `0199e7a0-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`,
  name: `Hot person ${String(index)}`,
  phone: "+919800000000",
  stage: "quote_sent",
  ownerUserId: null,
  destination: "Goa",
  startDate: null,
  score: 10 - index,
  reasons: ["quote_opened"],
  lastSignalAt: null,
});

const handedOver = {
  conversationId: "0199e7a0-0000-7000-8000-0000000002a1",
  name: "Meera Nair",
  reason: "Asked for a discount",
  since: "2026-10-16T03:00:00.000Z",
};
const suggestion = {
  id: "0199e7a0-0000-7000-8000-0000000003a1",
  leadId: "0199e7a0-0000-7000-8000-0000000003b1",
  name: "Karan Shah",
  kind: "lost" as const,
  lostReason: null,
  reason: "Said they booked elsewhere",
  createdAt: "2026-10-16T03:00:00.000Z",
};

interface Options {
  me?: SignedInMember;
  modules?: string[];
  overdue?: TodayItem[];
  dueToday?: TodayItem[];
  newLeads?: TodayItem[];
  departures?: TodayItem[];
  hot?: HotLead[];
  answers?: Record<string, Answer>;
}

function renderHome({
  me = member({ isOwner: true }),
  modules = ["crm", "inbox", "ai", "departures"],
  overdue = [snehaOverdue, vikramOverdue],
  dueToday = [priyaDue],
  newLeads = [rahulNew],
  departures = [],
  hot = [],
  answers = {},
}: Options = {}) {
  const api = stubApi({
    "organization.setup.get": { data: { steps: [{ step: "logo", done: false }], done: false } },
    "leads.stageBreakdown": { data: breakdown },
    "sales.hotLeads": { data: hot },
    "ai.settings": { data: { monthlyLimit: 1000, usedThisMonth: 412 } },
    "ai.chatsAnswered": { data: { chats: 37 } },
    "ai.handedOver": { data: [handedOver] },
    "ai.stageSuggestions": { data: { suggestions: [suggestion] } },
    ...answers,
  });
  const queryClient = newQueryClient({ ...paidSubscription, modules: modules as never });
  // What the three My tasks sections and Today's departures answer is put in the cache: the stub answers by path alone.
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });
  seedTasks(queryClient, { overdue, dueToday, newLeads });
  seedDepartures(queryClient, departures);
  renderWithApi(<HomePage />, queryClient, me);
  return api;
}

const card = (name: string) => screen.findByRole("region", { name });

beforeEach(() => {
  screenIs("phone");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home's day", () => {
  it("lists the cards in order: setup, leads, tasks, hot leads, departures, AI insights, needs your attention", async () => {
    renderHome({ hot: [hotLead(1)], departures: [departure] });
    const names = [
      messages.business.setup.homeHeading.replace("{organization}", "Sharma Travels"),
      h.leads.title,
      h.tasks.title,
      h.hot.title,
      h.departures.title,
      h.ai.title,
      h.attention.title,
    ];
    const cards: HTMLElement[] = [];
    for (const name of names) cards.push(await card(name));
    cards.slice(1).forEach((next, index) => {
      expect(cards[index]?.compareDocumentPosition(next) ?? 0 & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it("leaves out the tiles, the nudge, the month so far, the money tile and the screens list", async () => {
    renderHome();
    await card(h.tasks.title);
    for (const gone of ["Today at a glance", "This month so far", "Money to come", "Open Today", "Your screens:"]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.queryByText("Set up your agency")).toBeNull();
  });

  describe("Your tasks today", () => {
    it("shows at most five rows, from overdue, due today and new leads, and View all opens My tasks", async () => {
      renderHome({ overdue: [snehaOverdue, vikramOverdue], dueToday: [priyaDue], newLeads: [rahulNew, rahulNew] });
      const tasks = await card(h.tasks.title);
      await waitFor(() => {
        expect(within(tasks).getAllByRole("listitem").length).toBe(5);
      });
      expect(within(tasks).getByRole("link", { name: h.viewAll })).toHaveAttribute("href", "/today");
      expect(within(tasks).getByText("Sneha Iyer")).toBeVisible();
    });

    it("says so in one quiet line when nothing is due", async () => {
      renderHome({ overdue: [], dueToday: [], newLeads: [] });
      expect(await within(await card(h.tasks.title)).findByText(h.tasks.nothing)).toBeVisible();
    });

    it("is left out for a member who may not see leads", async () => {
      renderHome({ me: member({ permissions: ["settings:manage"] }) });
      await screen.findByRole("region", {
        name: messages.business.setup.homeHeading.replace("{organization}", "Sharma Travels"),
      });
      expect(screen.queryByRole("region", { name: h.tasks.title })).toBeNull();
    });
  });

  describe("Hot leads to call", () => {
    it("shows the five hottest with Call, and View all opens Leads", async () => {
      renderHome({ hot: [1, 2, 3, 4, 5, 6, 7].map(hotLead) });
      const hot = await card(h.hot.title);
      expect(within(hot).getAllByRole("listitem")).toHaveLength(5);
      expect(within(hot).getAllByRole("link", { name: /^Call / })).toHaveLength(5);
      expect(within(hot).getByRole("link", { name: h.viewAll })).toHaveAttribute("href", "/leads");
    });

    it("is left out when no lead is hot", async () => {
      renderHome({ hot: [] });
      await card(h.tasks.title);
      await waitFor(() => {
        expect(screen.queryByRole("region", { name: h.hot.title })).toBeNull();
      });
    });
  });

  describe("Departures leaving soon", () => {
    it("shows the departures with their seats, and View all opens Departures", async () => {
      renderHome({ departures: [departure], modules: ["crm", "departures"] });
      const departures = await card(h.departures.title);
      expect(within(departures).getByRole("link", { name: /Kerala backwaters batch/ })).toHaveAttribute(
        "href",
        "/departures/0199e7a0-0000-7000-8000-0000000000d1",
      );
      expect(within(departures).getByText(/8 of 12 seats/)).toBeVisible();
      expect(within(departures).getByRole("link", { name: h.viewAll })).toHaveAttribute("href", "/departures");
    });

    it("is left out when none leave soon", async () => {
      renderHome({ departures: [] });
      await card(h.tasks.title);
      expect(screen.queryByRole("region", { name: h.departures.title })).toBeNull();
    });
  });

  describe("AI insights", () => {
    it("shows the calls used against the monthly limit and the chats answered, to whoever manages the AI", async () => {
      renderHome();
      const ai = await card(h.ai.title);
      expect(await within(ai).findByText(/412 of 1,000/)).toBeVisible();
      expect((await within(ai).findAllByText("37")).length).toBeGreaterThan(0);
      expect(within(ai).getByText(new RegExp(h.ai.chats))).toBeVisible();
    });

    it("asks for the chats of the chosen period, and for the calls of the month alone", async () => {
      renderHome();
      await card(h.ai.title);
      await userEvent.setup().click(screen.getByRole("radio", { name: h.period.week }));
      await waitFor(() => {
        expect(sentBodies().some((sent) => sent.includes("chatsAnswered") && sent.includes("week"))).toBe(true);
      });
      expect(sentBodies().filter((sent) => sent.includes("ai.settings") && sent.includes("week"))).toEqual([]);
    });

    it("is left out, and asks nothing, without ai:manage", async () => {
      const api = renderHome({ me: member({ permissions: ["leads:view", "inbox:view"] }) });
      await card(h.tasks.title);
      expect(screen.queryByRole("region", { name: h.ai.title })).toBeNull();
      expect(api.calls).not.toContain("ai.chatsAnswered");
    });
  });

  describe("Needs your attention", () => {
    it("lists what the AI needs, and View all opens the AI agent page for a member who manages the AI", async () => {
      renderHome();
      const needs = await card(h.attention.title);
      expect(await within(needs).findByText("Meera Nair")).toBeVisible();
      expect(within(needs).getByText("Karan Shah")).toBeVisible();
      expect(within(needs).getByRole("link", { name: h.viewAll })).toHaveAttribute("href", "/ai-agent");
    });

    it("opens My tasks instead, for a member who doesn't manage the AI", async () => {
      renderHome({ me: member({ permissions: ["leads:view", "inbox:view"] }) });
      const needs = await card(h.attention.title);
      expect(await within(needs).findByText("Meera Nair")).toBeVisible();
      expect(within(needs).getByRole("link", { name: h.viewAll })).toHaveAttribute("href", "/today");
    });

    it("says in one quiet line that nothing needs the member", async () => {
      renderHome({ answers: { "ai.handedOver": { data: [] }, "ai.stageSuggestions": { data: { suggestions: [] } } } });
      expect(await within(await card(h.attention.title)).findByText(h.attention.nothing)).toBeVisible();
    });
  });
});
