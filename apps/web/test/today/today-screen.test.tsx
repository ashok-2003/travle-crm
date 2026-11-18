// My tasks (web revamp, spec 6): the day and how many things there are, the follow-ups line, then Overdue, Due today,
// New leads to contact and AI needs you, each hidden when empty, with its count and five rows, View all for the rest;
// Add a task as the screen's action; and the skeleton, the error with Try again, and a refusal's own sentence.
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
let needsMe: { handedOver: (typeof handedOver)[]; suggestions: (typeof lostSuggestion)[] };
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
  if (call.path === "ai.handedOver") return { data: needsMe.handedOver };
  if (call.path === "ai.stageSuggestions") return { data: { suggestions: needsMe.suggestions } };
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

const region = (name: string) => screen.findByRole("region", { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("phone");
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
    expect(screen.getByRole("button", { name: words.addTask.action })).toBeVisible();
  });

  it("counts what the AI needs and the payments to check in the day, each thing once", async () => {
    day = busy({ ...busyDay, counts: { ...busyDay.counts, paymentsToCheck: 2, checkTasks: 1 } });
    needsMe = { handedOver: [handedOver], suggestions: [lostSuggestion] };
    renderToday();
    expect(await screen.findByText("Fri 16 Oct · 11 to do")).toBeVisible();
  });

  it("shows Overdue, Due today and New leads to contact in that order, each with its count", async () => {
    renderToday();
    const overdue = await region(words.sections.overdue);
    const dueToday = await region(words.sections["due-today"]);
    const newLeads = await region(words.sections["new-leads"]);
    expect(overdue.compareDocumentPosition(dueToday) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dueToday.compareDocumentPosition(newLeads) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(overdue).getByText("2")).toBeVisible();
    expect(within(dueToday).getByText("3")).toBeVisible();
    expect(within(newLeads).getByText("3")).toBeVisible();
    expect(await within(overdue).findByRole("link", { name: "Sneha Iyer" })).toBeVisible();
    expect(await within(newLeads).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(await within(dueToday).findByRole("link", { name: "Priya Nair" })).toBeVisible();
  });

  it("shows no hot leads, departures, payments due, trip details or opened quotes, and no later-releases line", async () => {
    day = busy({
      ...busyDay,
      counts: { ...busyDay.counts, quoteOpened: 1, paymentsDue: 1, tripDetails: 1, departures: 1 },
    });
    const api = renderToday();
    await region(words.sections.overdue);
    expect(screen.queryByText(/Hot leads/i)).toBeNull();
    const asked = api.calls.filter((call) => call.path === "today.section").map((call) => call.input);
    expect(asked).not.toContainEqual({ section: "payments-due" });
    for (const name of ["payments-due", "trip-details", "departures", "quote-opened"]) {
      expect(JSON.stringify(asked)).not.toContain(name);
    }
    expect(api.calls.some((call) => call.path === "sales.hotLeads")).toBe(false);
    expect(screen.queryByText(/Departures and pickups/)).toBeNull();
  });

  it("shows five rows of a section, and View all shows the rest of Overdue in place", async () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      taskNamed(`Customer ${String(index + 1)}`, `0199e7a0-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`),
    );
    day = busy({ ...busyDay, counts: { ...busyDay.counts, overdue: 7 } });
    day.sections.overdue = many;
    renderToday();
    const overdue = await region(words.sections.overdue);
    expect(await within(overdue).findByRole("link", { name: "Customer 5" })).toBeVisible();
    expect(within(overdue).queryByRole("link", { name: "Customer 6" })).toBeNull();
    await userEvent.click(within(overdue).getByRole("button", { name: words.viewAll }));
    expect(await within(overdue).findByRole("link", { name: "Customer 7" })).toBeVisible();
    expect(within(overdue).queryByRole("button", { name: words.viewAll })).toBeNull();
  });

  it("sends New leads' View all to the Leads list filtered to New", async () => {
    day = busy({ ...busyDay, counts: { ...busyDay.counts, newLeads: 8 } });
    renderToday();
    const newLeads = await region(words.sections["new-leads"]);
    expect(await within(newLeads).findByRole("link", { name: words.viewAll })).toHaveAttribute(
      "href",
      "/leads?stage=new",
    );
  });

  it("marks a new lead contacted, and it leaves the section and the chips' counts load again", async () => {
    const api = renderToday(<ChipCounts />);
    const newLeads = await region(words.sections["new-leads"]);
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
      expect(within(newLeads).queryByRole("link", { name: "Rahul Sharma" })).toBeNull();
    });
    expect(api.calls.filter((call) => call.path === "leads.counts")).toHaveLength(2);
    expect(within(newLeads).getByRole("link", { name: "Arjun Mehta" })).toBeVisible();
  });

  describe("AI needs you", () => {
    it("shows a handed-over chat with Open chat and a suggestion with its two buttons, after New leads", async () => {
      needsMe = { handedOver: [handedOver], suggestions: [lostSuggestion] };
      renderToday();
      const ai = await region(words.sections.aiNeedsYou);
      const newLeads = await region(words.sections["new-leads"]);
      expect(newLeads.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(ai).getByText("2")).toBeVisible();
      expect(await within(ai).findByText("Meera Das")).toBeVisible();
      expect(within(ai).getByRole("link", { name: "Open chat: Meera Das" })).toHaveAttribute(
        "href",
        `/inbox/${handedOver.conversationId}`,
      );
      const lost = within(ai).getByRole("button", { name: "Yes, mark it Lost" });
      expect(lost).toHaveAttribute("data-variant", "destructive");
      expect(within(ai).getByRole("button", { name: "No" })).toBeVisible();
    });

    it("leads to the AI agent page only for someone who manages the AI", async () => {
      needsMe = {
        handedOver: Array.from({ length: 6 }, (_, index) => ({
          ...handedOver,
          conversationId: `0199e7a0-0000-7000-8000-00000000090${String(index)}`,
        })),
        suggestions: [],
      };
      const { unmount } = renderToday(null, member({ permissions: ["leads:view", "inbox:view", "leads:edit"] }));
      const ai = await region(words.sections.aiNeedsYou);
      await within(ai).findAllByText("Meera Das");
      expect(within(ai).queryByRole("link", { name: words.viewAll })).toBeNull();
      unmount();
      renderToday(null, member({ permissions: ["leads:view", "inbox:view", "leads:edit", "ai:manage"] }));
      const managed = await region(words.sections.aiNeedsYou);
      expect(within(managed).getByRole("link", { name: words.viewAll })).toHaveAttribute("href", "/ai-agent");
    });

    it("keeps the payments to check as a line inside it, leading to Payments", async () => {
      day = busy({ ...busyDay, counts: { ...busyDay.counts, paymentsToCheck: 2 } });
      renderToday();
      const ai = await region(words.sections.aiNeedsYou);
      expect(within(ai).getByRole("link", { name: /2 payments are waiting/ })).toHaveAttribute("href", "/payments");
    });
  });

  it("shows the follow-ups line when some are due, and never lists a follow-up", async () => {
    followUps = [dueFollowUp(false), dueFollowUp(true)];
    renderToday();
    expect(await screen.findByRole("link", { name: /2 follow-ups due · 1 replied/ })).toHaveAttribute(
      "href",
      "/leads/follow-ups",
    );
  });

  it("shows no follow-ups line when none are due", async () => {
    renderToday();
    await region(words.sections.overdue);
    expect(screen.queryByRole("link", { name: /follow-ups? due/ })).toBeNull();
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
    for (const name of ["Overdue", "Due today", "New leads to contact", "AI needs you"]) {
      expect(screen.queryByRole("region", { name })).toBeNull();
    }
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
