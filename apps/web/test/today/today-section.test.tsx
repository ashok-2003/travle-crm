// One of My tasks' tabs as a table (web revamp part 2): each tab's columns; the customer's name leading to their lead
// with the stage under it; when, in the colour of its urgency (red overdue, amber a new lead waiting, violet due today);
// the buttons as named icons, how to reach them first, then the row's main move in blue; a task on no lead has no one
// to call; and on a phone the same rows stacked.
import type { TodayItem, TodaySectionName } from "@travel-crm/contracts/today";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { bookingRoute, leadRoute } from "@/lib/routes";
import { TodaySection } from "@/today/today-section";
import { targetSize } from "../components/touch-targets";
import { renderAs, screenIs } from "../organization/render";
import { member } from "../support/members";
import { stubCalls } from "./api";
import { aLead, now, priyaDue, rahulNew, snehaOverdue, standaloneDue, vikramOverdue } from "./records";

const columns = messages.today.columns;

const kiranPayment: TodayItem = {
  kind: "payment-due",
  lead: aLead({ id: "0199e7a0-0000-7000-8000-0000000000a8", personName: "Kiran Joshi", stage: "won" }),
  installmentId: "0199e7a0-0000-7000-8000-0000000000c1",
  quoteId: "0199e7a0-0000-7000-8000-0000000000b2",
  amountPaise: 2_500_000,
  dueOn: "2026-10-15",
  missed: true,
};

const goaTrip: TodayItem = {
  kind: "trip-details",
  lead: aLead({ id: "0199e7a0-0000-7000-8000-0000000000a9", personName: "Leela Menon", stage: "won" }),
  bookingId: "0199e7a0-0000-7000-8000-0000000000d1",
  number: "BK-0007",
  startDate: "2026-10-22",
  missing: 2,
  total: 4,
};

function renderSection(
  section: Exclude<TodaySectionName, "departures" | "quote-opened">,
  items: TodayItem[],
  me = member({ isOwner: true }),
) {
  stubCalls((call) =>
    call.path === "today.section" ? { data: { items, nextCursor: null } } : { status: 404, reason: "NOT_FOUND" },
  );
  return renderAs(<TodaySection section={section} />, me);
}

const rowOf = async (name: string) => {
  const row = (await screen.findByRole("link", { name })).closest("tr");
  if (row === null) throw new Error(`${name} has no row`);
  return row;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("wide");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TodaySection", () => {
  it.each([
    ["overdue", [columns.customer, columns.due, columns.task, columns.details, columns.actions]],
    ["due-today", [columns.customer, columns.due, columns.task, columns.details, columns.actions]],
    ["new-leads", [columns.customer, columns.waiting, columns.source, columns.trip, columns.actions]],
    ["payments-due", [columns.customer, columns.amount, columns.due, columns.actions]],
    ["trip-details", [columns.customer, columns.leaves, columns.trip, columns.missing, columns.actions]],
  ] as const)("heads the %s table with its columns", async (section, headers) => {
    renderSection(section, [snehaOverdue]);
    const table = await screen.findByRole("table", { name: messages.today.sections[section] });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(headers);
  });

  it("names the customer as a link to their lead, the stage under the name, then the due, task and trip", async () => {
    renderSection("overdue", [snehaOverdue]);
    const row = await rowOf("Sneha Iyer");
    const [customer, due, task, details] = within(row).getAllByRole("cell");
    const name = within(row).getByRole("link", { name: "Sneha Iyer" });
    expect(name).toHaveAttribute("href", leadRoute(aLead().id));
    expect(customer).toContainElement(name);
    expect(customer).toContainElement(within(row).getByText(messages.leads.stages.contacted));
    expect(task).toContainElement(within(row).getByText("Send Goa options"));
    expect(within(row).getByText("Send Goa options")).toHaveClass("line-clamp-3");
    expect(details).toContainElement(within(row).getByText("Goa · Jan 2027 · 6 adults"));
    const when = within(row).getByText("Yesterday, 5:00 pm");
    expect(due).toContainElement(when);
    expect(when).toHaveClass("text-status-bad-ink");
  });

  it("draws the buttons as named icons: Call and WhatsApp, then Done in blue and Snooze, 44px to hit", async () => {
    renderSection("overdue", [snehaOverdue]);
    const row = await rowOf("Sneha Iyer");
    const buttons = [
      // A computer has no dialler: Call opens the call panel.
      within(row).getByRole("button", { name: "Call Sneha Iyer" }),
      within(row).getByRole("link", { name: "WhatsApp Sneha Iyer" }),
      within(row).getByRole("button", { name: "Done: Send Goa options" }),
      within(row).getByRole("button", { name: "Snooze: Send Goa options" }),
    ];
    for (const [index, button] of buttons.entries()) {
      expect(button).toHaveTextContent(/^$/);
      expect(button).toHaveAttribute("data-size", "icon-sm");
      expect(targetSize(button).height).toBeGreaterThanOrEqual(44);
      const after = buttons[index + 1];
      if (after) expect(button.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(buttons.map((button) => button.dataset.variant)).toEqual(["quiet", "quiet", "ghost", "quiet"]);
  });

  it("says when in the colour of its urgency: overdue red, a new lead's wait amber, due today violet", async () => {
    const overdue = renderSection("overdue", [vikramOverdue]);
    expect(await screen.findByText("Today, 9:30 am")).toHaveClass("text-status-bad-ink");
    // No trip known yet: the trip column says so.
    expect(screen.getByText(messages.leads.trip.none)).toBeVisible();
    overdue.unmount();
    const fresh = renderSection("new-leads", [rahulNew]);
    expect(await screen.findByText("12 min")).toHaveClass("text-status-attention-ink");
    expect(screen.getByText(messages.leads.sources.phone_call)).toBeVisible();
    expect(screen.getByText("Kashmir · Dec")).toBeVisible();
    fresh.unmount();
    renderSection("due-today", [priyaDue]);
    expect(await screen.findByText("4:00 pm")).toHaveClass("text-people-tint-ink");
  });

  it("gives a new lead Mark contacted in blue, for those who may edit leads", async () => {
    const { unmount } = renderSection("new-leads", [rahulNew]);
    const mark = await screen.findByRole("button", { name: "Mark Rahul Sharma contacted" });
    expect(mark).toHaveAttribute("data-variant", "ghost");
    expect(mark).toHaveAttribute("data-size", "icon-sm");
    expect(within(await rowOf("Rahul Sharma")).getByText(messages.leads.stages.new)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Done/ })).toBeNull();
    unmount();
    renderSection("new-leads", [rahulNew], member({ permissions: ["leads:view"] }));
    expect(await screen.findByRole("button", { name: "Call Rahul Sharma" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mark Rahul Sharma contacted" })).toBeNull();
  });

  it("shows a task on no lead with no one to name or call, and Done and Snooze", async () => {
    renderSection("due-today", [standaloneDue]);
    expect(await screen.findByText("Renew the IATA licence")).toBeVisible();
    expect(screen.getByText(messages.today.noLead)).toBeVisible();
    expect(screen.getByText("6:00 pm")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Done: Renew the IATA licence" })).toBeVisible();
  });

  it("shows a payment's amount in mono at the right, and its day in red once missed, with no stage", async () => {
    renderSection("payments-due", [kiranPayment]);
    const row = await rowOf("Kiran Joshi");
    const amount = within(row).getByText("₹25,000");
    expect(amount).toHaveClass("numbers");
    expect(amount.closest("td")).toHaveClass("text-right");
    expect(within(row).getByText("15 Oct")).toHaveClass("text-status-bad-ink");
    expect(within(row).queryByText(messages.leads.stages.won)).toBeNull();
  });

  it("shows what a trip is missing with the way to its booking, and the day it leaves", async () => {
    renderSection("trip-details", [goaTrip]);
    const row = await rowOf("Leela Menon");
    expect(within(row).getByText("2 of 4 travellers' details missing")).toBeVisible();
    expect(within(row).getByRole("link", { name: "Open booking BK-0007" })).toHaveAttribute(
      "href",
      bookingRoute("0199e7a0-0000-7000-8000-0000000000d1"),
    );
    expect(within(row).getByText("22 Oct")).toBeVisible();
  });

  it("on a phone stacks each row: the name as a 44px link, its stage and task, then its icons", async () => {
    screenIs("phone");
    renderSection("overdue", [snehaOverdue]);
    const list = await screen.findByRole("list", { name: messages.today.sections.overdue });
    expect(screen.queryByRole("table")).toBeNull();
    const [item] = within(list).getAllByRole("listitem");
    const name = within(list).getByRole("link", { name: "Sneha Iyer" });
    expect(item).toContainElement(name);
    expect(targetSize(name).height).toBeGreaterThanOrEqual(44);
    expect(item).toContainElement(within(list).getByText(messages.leads.stages.contacted));
    expect(item).toContainElement(within(list).getByText("Send Goa options"));
    const done = within(list).getByRole("button", { name: "Done: Send Goa options" });
    expect(item).toContainElement(done);
    expect(done).toHaveAttribute("data-size", "icon-sm");
  });
});
