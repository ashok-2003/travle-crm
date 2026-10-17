// Home's nudge (spec 3.1): how many things today and how many are overdue, then at most three of them (the first
// overdue, the new lead waiting longest, the next due today), each leading to its lead in the colour of its urgency,
// and Open Today. Never a long list; a quiet day says so; its loading and its error with Try again.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { leadRoute, routes } from "@/lib/routes";
import { TodayNudge } from "@/today/today-nudge";
import { renderAs, screenIs } from "../organization/render";
import { stubCalls, type Reply } from "./api";
import { busyDay, now, priyaDue, quietDay, rahulNew, snehaOverdue, standaloneDue, vikramOverdue } from "./records";

const words = messages.today.nudge;

let summary: Reply;

function renderNudge() {
  const api = stubCalls((call) => (call.path === "today.summary" ? summary : { status: 404, reason: "NOT_FOUND" }));
  renderAs(<TodayNudge />);
  return api;
}

const nudge = () => screen.findByRole("region", { name: /things? today/ });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("phone");
  summary = { data: busyDay };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TodayNudge", () => {
  it("says each thing's urgency, overdue red, a new lead's wait amber, due today violet, each leading to its lead", async () => {
    renderNudge();
    const card = await nudge();
    expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent("8 things today2 overdue");
    expect(within(card).getByText("2 overdue")).toHaveClass("text-status-bad-ink");
    const things = within(within(card).getByRole("list")).getAllByRole("link");
    expect(things.map((thing) => thing.getAttribute("href"))).toEqual([
      leadRoute(snehaOverdue.lead?.id ?? ""),
      leadRoute(rahulNew.lead.id),
      leadRoute(priyaDue.lead?.id ?? ""),
    ]);
    expect(things[0]).toHaveTextContent("Sneha IyerSend Goa options");
    expect(within(card).getByText(words.overdue)).toHaveClass("text-status-bad-ink");
    expect(things[1]).toHaveTextContent(`Rahul Sharma${words.waiting}`);
    expect(within(card).getByText("12 min ago")).toHaveClass("text-status-attention-ink");
    expect(within(card).getByText("4:00 pm")).toHaveClass("text-people-tint-ink");
    expect(within(card).getByRole("link", { name: words.open })).toHaveAttribute("href", routes.today);
  });

  it("never shows more than three items", async () => {
    summary = { data: { ...busyDay, top: [snehaOverdue, vikramOverdue, rahulNew, priyaDue] } };
    renderNudge();
    const card = await nudge();
    expect(within(within(card).getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
    expect(within(card).queryByText("Priya Nair")).toBeNull();
  });

  it("leads a task on no lead to Today, by its title", async () => {
    summary = { data: { ...busyDay, top: [standaloneDue] } };
    renderNudge();
    const card = await nudge();
    expect(within(card).getByRole("link", { name: /Renew the IATA licence/ })).toHaveAttribute("href", routes.today);
  });

  it("says a quiet day has nothing for today, and still opens Today", async () => {
    summary = { data: quietDay };
    renderNudge();
    const card = await screen.findByRole("region", { name: words.nothing });
    expect(within(card).queryByRole("list")).toBeNull();
    expect(within(card).getByRole("link", { name: words.open })).toHaveAttribute("href", routes.today);
  });

  it("shows its skeleton while it loads", async () => {
    summary = "never";
    renderNudge();
    expect(await screen.findByRole("status", { name: messages.common.loading })).toBeVisible();
  });

  it("says when it didn't load, and tries again", async () => {
    summary = "offline";
    renderNudge();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    summary = { data: busyDay };
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await nudge()).toBeVisible();
  });
});
