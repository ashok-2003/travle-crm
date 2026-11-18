// Home's leads card (Task 10): Total leads and a stage card each (never Not a lead), each opening the Leads list at its
// stage and period; a donut of the stages that have leads; a skeleton while loading, never a 0.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadsCard } from "@/home/leads-card";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { breakdown } from "./stages";

const words = messages.home.leads;
const stages = messages.leads.stages;

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

beforeEach(() => {
  screenIs("wide");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function render(period: "today" | "week" | "month" | "all", me = member({ isOwner: true })) {
  const api = stubApi({ "leads.stageBreakdown": { data: breakdown } });
  renderWithApi(<LeadsCard period={period} />, newQueryClient({ ...paidSubscription, modules: ["crm"] as never }), me);
  return api;
}

describe("LeadsCard", () => {
  it("shows Total leads, a card for each of the six stages and none for Not a lead", async () => {
    render("month");
    const card = await screen.findByRole("region", { name: new RegExp(words.title) });
    expect(await within(card).findByText("20")).toBeVisible();
    expect(within(card).getByText(words.total)).toBeVisible();
    const links = within(card).getAllByRole("link", {
      name: new RegExp(`^(${Object.values(stages).slice(0, 6).join("|")})`),
    });
    expect(links.map((link) => link.textContent)).toEqual([
      `${stages.new}7`,
      `${stages.contacted}5`,
      `${stages.quote_sent}3`,
      `${stages.booking_requested}2`,
      `${stages.won}2`,
      `${stages.lost}1`,
    ]);
    expect(within(card).queryByText(stages.not_a_lead)).toBeNull();
  });

  it("opens the Leads list at the stage and period, everyone's leads for a manager", async () => {
    render("week");
    const card = await screen.findByRole("region", { name: new RegExp(words.title) });
    const won = await within(card).findByRole("link", { name: new RegExp(`^${stages.won}`) });
    expect(won).toHaveAttribute("href", "/leads?view=everyone&stage=won&created=week");
  });

  it("leaves out the view for a salesperson, and the period for All time", async () => {
    render("all", member({ permissions: ["leads:view"] }));
    const card = await screen.findByRole("region", { name: new RegExp(words.title) });
    const won = await within(card).findByRole("link", { name: new RegExp(`^${stages.won}`) });
    expect(won).toHaveAttribute("href", "/leads?stage=won");
  });

  it("shows Total leads as a figure, not a link, and Open reports as a link", async () => {
    render("month");
    const card = await screen.findByRole("region", { name: new RegExp(words.title) });
    await within(card).findByText("20");
    expect(within(card).queryByRole("link", { name: new RegExp(words.total) })).toBeNull();
    expect(within(card).getByRole("link", { name: words.reports })).toHaveAttribute("href", "/reports");
  });

  it("tints each stage card with its stage's colours, and gives the title an info hint", async () => {
    render("month");
    const card = await screen.findByRole("region", { name: new RegExp(words.title) });
    const quote = await within(card).findByRole("link", { name: new RegExp(`^${stages.quote_sent}`) });
    expect(quote.className).toContain("bg-status-attention-fill");
    const fresh = within(card).getByRole("link", { name: new RegExp(`^${stages.new}`) });
    expect(fresh.className).toContain("bg-stage-new-fill");
    expect(within(card).getByRole("button", { name: /What does .* mean\?/ })).toBeVisible();
  });

  it("lists, for screen readers, one row for each stage that has leads, in the donut's order", async () => {
    stubApi({
      "leads.stageBreakdown": {
        data: {
          total: 5,
          stages: { ...breakdown.stages, new: 5, contacted: 0, quote_sent: 0, booking_requested: 0, won: 0, lost: 0 },
        },
      },
    });
    renderWithApi(<LeadsCard period="month" />, newQueryClient({ ...paidSubscription, modules: ["crm"] as never }));
    const table = await screen.findByRole("table", { name: words.table });
    expect(within(table).getAllByRole("row")).toHaveLength(1);
  });

  it("shows skeletons, not a 0, while the figures load", () => {
    stubApi({ "leads.stageBreakdown": "never" });
    renderWithApi(<LeadsCard period="month" />, newQueryClient({ ...paidSubscription, modules: ["crm"] as never }));
    const card = screen.getByRole("region", { name: new RegExp(words.title) });
    expect(card.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(0);
    expect(within(card).queryByText("0")).toBeNull();
  });

  it("says so, with Try again, when the figures didn't load", async () => {
    stubApi({ "leads.stageBreakdown": { status: 500 } });
    renderWithApi(<LeadsCard period="month" />, newQueryClient({ ...paidSubscription, modules: ["crm"] as never }));
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: messages.common.tryAgain }));
  });
});
