// My tasks (web revamp, spec 6; part 2): the day and how many things there are, the follow-ups line, then tabs with
// their counts (Overdue, Due today, New leads, AI needs you, Payments due, Trips leaving soon), each hidden when empty and
// the first with something open, each tab a table of its own; Add a task as the screen's action; and the skeleton, the
// error with Try again, and a refusal's own sentence.
import type { TodayItem, TodaySectionName, TodaySummary } from "@travel-crm/contracts/today";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { messages } from "@/i18n/messages";
import { useLeadCounts } from "@/leads/list/use-leads";
import { TodayScreen } from "@/today/today-screen";
import { renderAs, screenIs } from "../organization/render";
import { member } from "../support/members";
import { stubCalls, type Call, type Reply } from "./api";
import {
  aLead,
  aTask,
  busyDay,
  now,
  priyaDue,
  quietDay,
  rahulNew,
  snehaOverdue,
  standaloneDue,
  vikramOverdue,
} from "./records";

const words = messages.today;

const arjunNew: TodayItem = {
  kind: "new-lead",
  lead: aLead({ id: "0199e7a0-0000-7000-8000-0000000000a5", personName: "Arjun Mehta", phone: "+919822233344" }),
  waitingSince: "2026-10-16T03:30:00.000Z",
};

const kiranPayment: TodayItem = {
  kind: "payment-due",
  lead: aLead({ id: "0199e7a0-0000-7000-8000-0000000000a8", personName: "Kiran Joshi" }),
  installmentId: "0199e7a0-0000-7000-8000-0000000000c1",
  quoteId: "0199e7a0-0000-7000-8000-0000000000b2",
  amountPaise: 2_500_000,
  dueOn: "2026-10-15",
  missed: true,
};

const goaTrip: TodayItem = {
  kind: "trip-details",
  lead: aLead({ id: "0199e7a0-0000-7000-8000-0000000000a9", personName: "Leela Menon" }),
  bookingId: "0199e7a0-0000-7000-8000-0000000000d1",
  number: "BK-0007",
  startDate: "2026-10-22",
  missing: 2,
  total: 4,
};

/** A follow-up-free task of the member's own, due earlier today, for a section with more rows than it shows. */
const taskNamed = (name: string, id: string): TodayItem => ({
  kind: "task",
  task: aTask({ id, title: `Call ${name}`, dueAt: "2026-10-16T02:30:00.000Z", kind: "task" }),
  lead: aLead({ id: `${id.slice(0, -2)}ff`, personName: name }),
  booking: null,
});

const handedOver = {
  conversationId: "0199e7a0-0000-7000-8000-000000000901",
  name: "Meera Das",
  reason: "Asked for a discount",
  since: "2026-10-16T03:00:00.000Z",
};

const lostSuggestion = {
  id: "0199e7a0-0000-7000-8000-000000000911",
  leadId: "0199e7a0-0000-7000-8000-000000000912",
  name: "Nitin Rao",
  kind: "lost" as const,
  lostReason: null,
  reason: "Said he booked elsewhere",
  createdAt: "2026-10-16T03:00:00.000Z",
};

/** A follow-up of the member's due now, as the follow-ups board answers; the customer wrote last when `replied`. */
const dueFollowUp = (replied: boolean) => ({
  taskId: `0199e7a0-0000-7000-8000-00000000095${replied ? "1" : "0"}`,
  title: "Send options",
  dueAt: "2026-10-15T11:30:00.000Z",
  assigneeUserId: null,
  byAi: false,
  lead: { id: "0199e7a0-0000-7000-8000-000000000960", name: "Isha", stage: "contacted", phone: null },
  whatsapp: replied
    ? {
        conversationId: "0199e7a0-0000-7000-8000-000000000961",
        lastAt: null,
        lastFrom: "customer",
        lastText: null,
        windowOpen: true,
      }
    : null,
  ai: null,
});

/** What the api holds: the summary (or how it fails), each section's first page, and the page after it, if any. */
interface Day {
  summary: TodaySummary;
  summaryFails?: Reply;
  sections: Record<TodaySectionName, TodayItem[]>;
  nextPages: Partial<Record<TodaySectionName, TodayItem[]>>;
}

let day: Day;
let needsMe: {
  handedOver: (typeof handedOver)[];
  suggestions: (typeof lostSuggestion)[];
  /** How many wait in all, where the api's rows stop at 20; the rows' own count when not given. */
  totals?: { chats: number; suggestions: number };
};
let followUps: ReturnType<typeof dueFollowUp>[];

/** The id a page's cursor names: a task's, or a new lead's. */
const idOf = (item: TodayItem) =>
  item.kind === "task"
    ? item.task.id
    : item.kind === "quote-opened"
      ? item.quote.id
      : item.kind === "payment-due"
        ? item.installmentId
        : item.kind === "departure"
          ? item.departureId
          : item.lead.id;

/** The api's answer, keeping what it holds as a change leaves it: a lead marked contacted is no longer new. */
function answer(call: Call): Reply {
  if (call.path === "today.summary") return day.summaryFails ?? { data: day.summary };
  if (call.path === "today.section") {
    const { section, after } = call.input as { section: TodaySectionName; after?: string };
    const next = day.nextPages[section];
    if (after !== undefined) return { data: { items: next ?? [], nextCursor: null } };
    const items = day.sections[section];
    const last = items.at(-1);
    return { data: { items, nextCursor: next && last ? idOf(last) : null } };
  }
  if (call.path === "ai.handedOver") {
    return { data: { chats: needsMe.handedOver, total: needsMe.totals?.chats ?? needsMe.handedOver.length } };
  }
  if (call.path === "ai.stageSuggestions") {
    return {
      data: { suggestions: needsMe.suggestions, total: needsMe.totals?.suggestions ?? needsMe.suggestions.length },
    };
  }
  if (call.path === "tasks.followUps") return { data: { rows: followUps, people: {} } };
  // Whether the person takes new leads in turn, for the away switch above the day: not in the pool here.
  if (call.path === "assignment.mine") return { data: { inPool: false, awayUntil: null } };
  if (call.path === "leads.counts") {
    return { data: { open: 3, new: day.summary.counts.newLeads, contacted: 0, quote_sent: 0, booking_requested: 0 } };
  }
  if (call.path === "today.dismissQuoteOpened") {
    const { leadId } = call.input as { leadId: string };
    day.sections["quote-opened"] = day.sections["quote-opened"].filter(
      (item) => "lead" in item && item.lead?.id !== leadId,
    );
    day.summary = { ...day.summary, counts: { ...day.summary.counts, quoteOpened: 0 } };
    return { data: null };
  }
  if (call.path === "leads.moveStage") {
    const { leadId } = call.input as { leadId: string };
    day.sections["new-leads"] = day.sections["new-leads"].filter((item) => "lead" in item && item.lead?.id !== leadId);
    day.summary = { ...day.summary, counts: { ...day.summary.counts, newLeads: day.summary.counts.newLeads - 1 } };
    return { data: null };
  }
  return { status: 404, reason: "NOT_FOUND" };
}

function busy(summary: TodaySummary = busyDay): Day {
  return {
    summary,
    sections: {
      overdue: [snehaOverdue, vikramOverdue],
      "payments-due": [],
      "trip-details": [],
      departures: [],
      "new-leads": [rahulNew, arjunNew],
      "quote-opened": [],
      "due-today": [priyaDue, standaloneDue],
    },
    nextPages: {},
  };
}

/** The Leads chips' counts, held in the cache as when the list was opened before Today. */
function ChipCounts() {
  useLeadCounts({ view: "mine", stage: "open", limit: 25 });
  return null;
}

function renderToday(alongside: ReactNode = null, me = member({ isOwner: true })) {
  const api = stubCalls(answer);
  const { unmount } = renderAs(
    <>
      <TodayScreen />
      {alongside}
      <Toaster />
    </>,
    me,
  );
  return { ...api, unmount };
}

const tab = (name: string) => screen.findByRole("tab", { name });
const panel = (name: string) => screen.findByRole("tabpanel", { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("wide");
  day = busy();
  needsMe = { handedOver: [], suggestions: [] };
  followUps = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TodayScreen", () => {
  it("heads the screen 'Fri 16 Oct · 8 to do · 2 overdue', with Add a task as its action", async () => {
    renderToday();
    expect(screen.getByRole("heading", { level: 1, name: "My tasks" })).toBeVisible();
    expect(await screen.findByText("Fri 16 Oct · 8 to do")).toBeVisible();
    expect(screen.getByText("2 overdue")).toHaveClass("text-status-bad-ink");
    // The screen's one main action: the blue primary button.
    expect(screen.getByRole("button", { name: words.addTask.action })).toHaveAttribute("data-variant", "default");
  });

  it("counts what the AI needs and the payments to check in the day, each thing once", async () => {
    day = busy({ ...busyDay, counts: { ...busyDay.counts, paymentsToCheck: 2, checkTasks: 1 } });
    needsMe = { handedOver: [handedOver], suggestions: [lostSuggestion] };
    renderToday();
    expect(await screen.findByText("Fri 16 Oct · 11 to do")).toBeVisible();
  });

  it("shows a tab for each list with something in it, in order with its count, the first one open", async () => {
    renderToday();
    await tab("Overdue 2");
    expect(screen.getAllByRole("tab").map((each) => each.textContent)).toEqual([
      "Overdue 2",
      "Due today 3",
      "New leads 3",
    ]);
    expect(screen.getByRole("tablist", { name: words.sectionsLabel })).toHaveAttribute("data-variant", "solid");
    expect(screen.getByRole("tab", { name: "Overdue 2" })).toHaveAttribute("aria-selected", "true");
    const overdue = await panel("Overdue 2");
    expect(await within(overdue).findByRole("link", { name: "Sneha Iyer" })).toBeVisible();
    expect(within(overdue).getByRole("table", { name: words.sections.overdue })).toBeVisible();
    // The other tabs' tables wait out of sight.
    expect(screen.queryByRole("link", { name: "Rahul Sharma" })).toBeNull();
  });

  it("opens the first tab with something in it when Overdue is empty", async () => {
    day = busy({ ...busyDay, counts: { ...busyDay.counts, overdue: 0 } });
    renderToday();
    expect(await tab("Due today 3")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /^Overdue/ })).toBeNull();
    expect(await within(await panel("Due today 3")).findByRole("link", { name: "Priya Nair" })).toBeVisible();
  });

  it("switches to another tab's table", async () => {
    renderToday();
    await userEvent.click(await tab("New leads 3"));
    const newLeads = await panel("New leads 3");
    expect(await within(newLeads).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(within(newLeads).getByRole("table", { name: words.sections["new-leads"] })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Sneha Iyer" })).toBeNull();
  });

  it("shows no hot leads, departures or opened quotes, and no later-releases line", async () => {
    day = busy({ ...busyDay, counts: { ...busyDay.counts, quoteOpened: 1, departures: 1 } });
    const api = renderToday();
    await panel("Overdue 2");
    expect(screen.queryByText(/Hot leads/i)).toBeNull();
    const asked = JSON.stringify(api.calls.filter((call) => call.path === "today.section").map((call) => call.input));
    expect(asked).not.toContain("departures");
    expect(asked).not.toContain("quote-opened");
    expect(api.calls.some((call) => call.path === "sales.hotLeads")).toBe(false);
    expect(screen.queryByText(/Departures and pickups/)).toBeNull();
  });

  it("keeps Payments due and Trips leaving soon as the last two tabs, after AI needs you, and counts them", async () => {
    day = busy({ ...busyDay, counts: { ...busyDay.counts, paymentsDue: 1, tripDetails: 1 } });
    day.sections["payments-due"] = [kiranPayment];
    day.sections["trip-details"] = [goaTrip];
    needsMe = { handedOver: [handedOver], suggestions: [] };
    renderToday();
    await tab("Trips leaving soon 1");
    expect(screen.getAllByRole("tab").map((each) => each.textContent)).toEqual([
      "Overdue 2",
      "Due today 3",
      "New leads 3",
      "AI needs you 1",
      "Payments due 1",
      "Trips leaving soon 1",
    ]);
    await userEvent.click(screen.getByRole("tab", { name: "Payments due 1" }));
    const payments = await panel("Payments due 1");
    expect(await within(payments).findByRole("link", { name: "Kiran Joshi" })).toBeVisible();
    expect(within(payments).getByText("₹25,000")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Trips leaving soon 1" }));
    expect(await within(await panel("Trips leaving soon 1")).findByRole("link", { name: "Leela Menon" })).toBeVisible();
    // 8 things, 1 payment due and 1 trip, and the AI's 1 chat.
    expect(await screen.findByText("Fri 16 Oct · 11 to do")).toBeVisible();
  });

  it("holds every item of a tab in its table, with no View all, and loads the next page after the rows", async () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      taskNamed(`Customer ${String(index + 1)}`, `0199e7a0-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`),
    );
    day = busy({ ...busyDay, counts: { ...busyDay.counts, overdue: 8, newLeads: 8 } });
    day.sections.overdue = many;
    day.nextPages.overdue = [taskNamed("Customer 8", "0199e7a0-0000-7000-8000-000000000199")];
    renderToday();
    const overdue = await panel("Overdue 8");
    expect(await within(overdue).findByRole("link", { name: "Customer 7" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "View all" })).toBeNull();
    expect(screen.queryByRole("link", { name: "View all" })).toBeNull();
    await userEvent.click(within(overdue).getByRole("button", { name: words.more.overdue }));
    expect(await within(overdue).findByRole("link", { name: "Customer 8" })).toBeVisible();
  });

  it("opens the Owner's own leads not contacted yet from New leads, as the section holds their own", async () => {
    renderToday();
    await userEvent.click(await tab("New leads 3"));
    expect(within(await panel("New leads 3")).getByRole("link", { name: "All new leads" })).toHaveAttribute(
      "href",
      "/leads?show=uncontacted",
    );
  });

  it("leads back to the Leads list on New leads and to the AI agent page for whoever manages the AI", async () => {
    needsMe = { handedOver: [handedOver], suggestions: [] };
    const { unmount } = renderToday(null, member({ permissions: ["leads:view", "inbox:view", "leads:edit"] }));
    await userEvent.click(await tab("New leads 3"));
    const all = within(await panel("New leads 3")).getByRole("link", { name: "All new leads" });
    // The member's own leads nobody has contacted yet: the section's count, by the same rule.
    expect(all).toHaveAttribute("href", "/leads?show=uncontacted");
    expect(all.querySelector("svg")).not.toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "AI needs you 1" }));
    expect(within(await panel("AI needs you 1")).queryByRole("link", { name: "AI agent" })).toBeNull();
    unmount();
    renderToday(null, member({ permissions: ["leads:view", "inbox:view", "leads:edit", "ai:manage"] }));
    await userEvent.click(await tab("AI needs you 1"));
    expect(within(await panel("AI needs you 1")).getByRole("link", { name: "AI agent" })).toHaveAttribute(
      "href",
      "/ai-agent",
    );
  });

  it("brings a chosen tab fully into view when its row scrolls sideways", async () => {
    screenIs("phone");
    const shown = vi.fn();
    Object.assign(Element.prototype, { scrollIntoView: shown });
    renderToday();
    const newLeads = await screen.findByRole("tab", { name: "New leads 3" });
    await userEvent.click(newLeads);
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest", inline: "nearest" }));
    expect(shown.mock.contexts.at(-1)).toBe(newLeads);
  });

  it("on a phone scrolls the tabs sideways and stacks the rows, five and then Show more", async () => {
    screenIs("phone");
    day.sections.overdue = Array.from({ length: 7 }, (_, index) =>
      taskNamed(`Customer ${String(index + 1)}`, `0199e7a0-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`),
    );
    renderToday();
    const tabs = await screen.findByRole("tablist", { name: words.sectionsLabel });
    expect(tabs).toHaveClass("overflow-x-auto");
    // Each tab keeps its words' width with even padding, never squeezed under them (they spilled into the next tab).
    for (const tab of within(tabs).getAllByRole("tab")) {
      expect(tab.className).toContain("group-data-[variant=solid]/tabs-list:flex-none");
    }
    const overdue = await panel("Overdue 2");
    const list = await within(overdue).findByRole("list", { name: words.sections.overdue });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(overdue).queryByRole("table")).toBeNull();
    await userEvent.click(within(overdue).getByRole("button", { name: words.more.overdue }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
  });

  it("marks a new lead contacted, and it leaves the tab and the chips' counts load again", async () => {
    const api = renderToday(<ChipCounts />);
    await userEvent.click(await tab("New leads 3"));
    const newLeads = await panel("New leads 3");
    await waitFor(() => {
      expect(api.calls.filter((call) => call.path === "leads.counts")).toHaveLength(1);
    });
    await userEvent.click(await within(newLeads).findByRole("button", { name: "Mark Rahul Sharma contacted" }));
    await waitFor(() => {
      expect(api.calls.find((call) => call.path === "leads.moveStage")?.input).toEqual({
        leadId: rahulNew.lead.id,
        stage: "contacted",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "Rahul Sharma" })).toBeNull();
    });
    expect(api.calls.filter((call) => call.path === "leads.counts")).toHaveLength(2);
    expect(within(await panel("New leads 2")).getByRole("link", { name: "Arjun Mehta" })).toBeVisible();
  });

  describe("AI needs you", () => {
    it("is a table of the handed-over chats with Open chat and the suggestions with their two buttons", async () => {
      needsMe = { handedOver: [handedOver], suggestions: [lostSuggestion] };
      renderToday();
      await userEvent.click(await tab("AI needs you 2"));
      const ai = await panel("AI needs you 2");
      const table = within(ai).getByRole("table", { name: words.sections.aiNeedsYou });
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual([words.columns.customer, words.columns.since, words.columns.why, words.columns.actions]);
      expect(within(table).getByText("Meera Das")).toBeVisible();
      expect(within(table).getByText("Handed over: Asked for a discount")).toBeVisible();
      expect(within(table).getByRole("link", { name: "Open chat: Meera Das" })).toHaveAttribute(
        "href",
        `/inbox/${handedOver.conversationId}`,
      );
      expect(within(table).getByRole("link", { name: "Nitin Rao" })).toHaveAttribute(
        "href",
        `/leads/${lostSuggestion.leadId}`,
      );
      const lost = within(table).getByRole("button", { name: "Yes, mark it Lost" });
      expect(lost).toHaveAttribute("data-variant", "destructive");
      expect(within(table).getByRole("button", { name: "No" })).toBeVisible();
    });

    it("keeps the payments to check above the table as an amber card with a Check payments button, no count of its own", async () => {
      day = busy({ ...busyDay, counts: { ...busyDay.counts, paymentsToCheck: 2 } });
      renderToday();
      // Only payments: the tab counts what the AI asks, so it has no number.
      await userEvent.click(await tab("AI needs you"));
      const ai = await panel("AI needs you");
      const card = within(ai).getByRole("region", { name: "2 payments are waiting for your word" });
      expect(card.className).toContain("--brand-status-attention-fill");
      expect(within(card).getByText(words.paymentsToCheck.how)).toBeVisible();
      expect(within(card).getByRole("link", { name: words.paymentsToCheck.open })).toHaveAttribute("href", "/payments");
      expect(within(ai).queryByRole("table")).toBeNull();
    });

    it("counts every one waiting on its tab, past the 20 rows the api sends of each", async () => {
      needsMe = {
        handedOver: Array.from({ length: 20 }, (_, index) => ({
          ...handedOver,
          conversationId: `0199e7a0-0000-7000-8000-0000000009${String(index).padStart(2, "0")}`,
        })),
        suggestions: Array.from({ length: 20 }, (_, index) => ({
          ...lostSuggestion,
          id: `0199e7a0-0000-7000-8000-0000000008${String(index).padStart(2, "0")}`,
        })),
        totals: { chats: 25, suggestions: 22 },
      };
      renderToday();
      expect(await tab("AI needs you 47")).toBeVisible();
    });

    it("counts only the AI's rows on its tab, not the payments", async () => {
      day = busy({ ...busyDay, counts: { ...busyDay.counts, paymentsToCheck: 4 } });
      needsMe = { handedOver: [handedOver], suggestions: [] };
      renderToday();
      expect(await tab("AI needs you 1")).toBeVisible();
    });
  });

  it("shows the follow-ups line when some are due, and never lists a follow-up", async () => {
    followUps = [dueFollowUp(false), dueFollowUp(true)];
    renderToday();
    expect(await screen.findByText("2 follow-ups due · 1 replied")).toBeVisible();
    expect(screen.getByRole("link", { name: "Follow-ups" })).toHaveAttribute("href", "/leads/follow-ups");
  });

  it("shows no follow-ups line when none are due", async () => {
    renderToday();
    await panel("Overdue 2");
    expect(screen.queryByText(/follow-ups? due/)).toBeNull();
  });

  it("says 'Nothing to do right now.' when everything is empty", async () => {
    day = {
      ...busy(quietDay),
      sections: { ...busy().sections, overdue: [], "new-leads": [], "due-today": [] },
    };
    renderToday();
    expect(await screen.findByText(words.nothing)).toBeVisible();
    expect(words.nothing).toBe("Nothing to do right now.");
    expect(screen.getByText("Fri 16 Oct")).toBeVisible();
    expect(screen.queryByText(/\d to do/)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows the skeleton, the error with Try again, and a refusal's sentence", async () => {
    day.summaryFails = "never";
    const loading = renderToday();
    expect(await screen.findByRole("status", { name: messages.common.loading })).toBeVisible();
    loading.unmount();

    day.summaryFails = "offline";
    const failing = renderToday();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    delete day.summaryFails;
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText("Fri 16 Oct · 8 to do")).toBeVisible();
    failing.unmount();

    day.summaryFails = { status: 403, reason: "MODULE_NOT_ON_PLAN" };
    renderToday();
    expect(await screen.findByText(messages.errors.reasons.MODULE_NOT_ON_PLAN)).toBeVisible();
    expect(screen.queryByText(words.loadFailed)).toBeNull();
  });
});
