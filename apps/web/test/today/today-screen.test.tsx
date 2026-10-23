// Today (spec 3.5, R35): the day in the agency's zone and how many things it holds, then Overdue, New leads not contacted
// yet and Due today, each with its count and a page at a time; Add a task as the screen's action; a new lead marked
// contacted leaves its section, and the Leads chips' counts load again; a quiet line about what later releases add; and
// the skeleton, the error with Try again, and a refusal's own sentence.
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

const rohanDue: TodayItem = {
  kind: "task",
  task: aTask({
    id: "0199e7a0-0000-7000-8000-0000000000f6",
    title: "Call back about the Dubai visa",
    dueAt: "2026-10-16T12:30:00.000Z",
  }),
  lead: aLead({ id: "0199e7a0-0000-7000-8000-0000000000a6", personName: "Rohan Gupta" }),
};

/** What the api holds: the summary (or how it fails), each section's first page, and the page after it, if any. */
interface Day {
  summary: TodaySummary;
  summaryFails?: Reply;
  sections: Record<TodaySectionName, TodayItem[]>;
  nextPages: Partial<Record<TodaySectionName, TodayItem[]>>;
}

let day: Day;

/** The id a page's cursor names: a task's, or a new lead's. */
const idOf = (item: TodayItem) => (item.kind === "task" ? item.task.id : item.lead.id);

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
  // Whether the person takes new leads in turn, for the away switch above the day: not in the pool here.
  if (call.path === "assignment.mine") return { data: { inPool: false, awayUntil: null } };
  if (call.path === "leads.counts") {
    return { data: { open: 3, new: day.summary.counts.newLeads, contacted: 0, quote_sent: 0, booking_requested: 0 } };
  }
  if (call.path === "leads.moveStage") {
    const { leadId } = call.input as { leadId: string };
    day.sections["new-leads"] = day.sections["new-leads"].filter((item) => item.lead?.id !== leadId);
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
      "new-leads": [rahulNew, arjunNew],
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

function renderToday(alongside: ReactNode = null) {
  const api = stubCalls(answer);
  const { unmount } = renderAs(
    <>
      <TodayScreen />
      {alongside}
      <Toaster />
    </>,
  );
  return { ...api, unmount };
}

const region = (name: string) => screen.findByRole("region", { name });

const sectionCalls = (calls: Call[]) => calls.filter((call) => call.path === "today.section");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("phone");
  day = busy();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TodayScreen", () => {
  it("heads the screen 'Fri 16 Oct · 8 things · 2 overdue', with Add a task as its action", async () => {
    renderToday();
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(await screen.findByText("Fri 16 Oct · 8 things")).toBeVisible();
    expect(screen.getByText("2 overdue")).toHaveClass("text-status-bad-ink");
    expect(screen.getByRole("button", { name: words.addTask.action })).toBeVisible();
  });

  it("shows Overdue, New leads not contacted yet and Due today, each with its count and Show more", async () => {
    day.nextPages["due-today"] = [rohanDue];
    const api = renderToday();
    const overdue = await region(words.sections.overdue);
    const newLeads = await region(words.sections["new-leads"]);
    const dueToday = await region(words.sections["due-today"]);
    // In that order, each with the day's count, each asked for its own first page.
    expect(overdue.compareDocumentPosition(newLeads) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(newLeads.compareDocumentPosition(dueToday) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(overdue).getByText("2")).toBeVisible();
    expect(within(newLeads).getByText("3")).toBeVisible();
    expect(within(dueToday).getByText("3")).toBeVisible();
    expect(await within(overdue).findByRole("link", { name: "Sneha Iyer" })).toBeVisible();
    expect(await within(newLeads).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(await within(dueToday).findByRole("link", { name: "Priya Nair" })).toBeVisible();
    expect(sectionCalls(api.calls).map((call) => call.input)).toEqual(
      expect.arrayContaining([{ section: "overdue" }, { section: "new-leads" }, { section: "due-today" }]),
    );
    // Only Due today has more; its next page follows the first page's last item.
    expect(within(overdue).queryByRole("button", { name: words.more.overdue })).toBeNull();
    await userEvent.click(within(dueToday).getByRole("button", { name: words.more["due-today"] }));
    expect(await within(dueToday).findByRole("link", { name: "Rohan Gupta" })).toBeVisible();
    expect(sectionCalls(api.calls).at(-1)?.input).toEqual({ section: "due-today", after: standaloneDue.task.id });
    expect(within(dueToday).queryByRole("button", { name: words.more["due-today"] })).toBeNull();
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
    expect(await screen.findByText(messages.leads.lead.moved.replace("{stage}", "Contacted"))).toBeVisible();
    await waitFor(() => {
      expect(within(newLeads).queryByRole("link", { name: "Rahul Sharma" })).toBeNull();
    });
    expect(api.calls.filter((call) => call.path === "leads.counts")).toHaveLength(2);
    expect(within(newLeads).getByRole("link", { name: "Arjun Mehta" })).toBeVisible();
    expect(within(newLeads).getByText("2")).toBeVisible();
  });

  it("says 'Nothing for today' when all three are empty, and keeps the quiet line about later releases", async () => {
    day = { ...busy(quietDay), sections: { overdue: [], "new-leads": [], "due-today": [] } };
    const api = renderToday();
    expect(await screen.findByText(words.nothing)).toBeVisible();
    // The day alone: "0 things" right above "Nothing for today" would say it twice.
    expect(screen.getByText("Fri 16 Oct")).toBeVisible();
    expect(screen.queryByText(/0 things/)).toBeNull();
    expect(screen.queryByText(/overdue$/)).toBeNull();
    expect(screen.getByText(words.later)).toBeVisible();
    for (const section of Object.values(words.sections)) {
      expect(screen.queryByRole("region", { name: section })).toBeNull();
    }
    expect(api.calls.map((call) => call.path)).toEqual(["assignment.mine", "today.summary"]);
  });

  it("shows the skeleton, the error with Try again, and a refusal's sentence", async () => {
    day.summaryFails = "never";
    const loading = renderToday();
    expect(await screen.findByRole("status", { name: messages.common.loading })).toBeVisible();
    expect(screen.queryByText(words.later)).toBeNull();
    loading.unmount();

    day.summaryFails = "offline";
    const failing = renderToday();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    delete day.summaryFails;
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText("Fri 16 Oct · 8 things")).toBeVisible();
    failing.unmount();

    day.summaryFails = { status: 403, reason: "MODULE_NOT_ON_PLAN" };
    renderToday();
    expect(await screen.findByText(messages.errors.reasons.MODULE_NOT_ON_PLAN)).toBeVisible();
    expect(screen.queryByText(words.loadFailed)).toBeNull();
  });
});
