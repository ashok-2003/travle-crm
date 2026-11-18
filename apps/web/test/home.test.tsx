// Home (/dashboard): the greeting, the period filter as the header's action, the setup card above everything for
// whoever manages settings, then the leads card for whoever sees leads on a plan with them.
import type { SetupChecklist } from "@travel-crm/contracts/profile";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(app)/dashboard/page";
import { messages } from "@/i18n/messages";
import type { SignedInMember } from "@/session/me-context";
import { newQueryClient, paidSubscription, renderWithApi } from "./organization/api";
import { screenIs } from "./organization/render";
import { stubApi } from "./support/api-stub";
import { member } from "./support/members";
import { busyDay } from "./today/records";
import { breakdown, sentBodies } from "./home/stages";

// Home shows the inbox count, which polls faster or slower by the page it is on.
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

const period = messages.home.period;
const setupCardName = messages.business.setup.homeHeading.replace("{organization}", "Sharma Travels");

/** Halfway through setting up: the setup card shows. */
const halfway: SetupChecklist = {
  steps: [
    { step: "business-details", done: true },
    { step: "contact-phone", done: true },
    { step: "logo", done: false },
    { step: "branding", done: true },
    { step: "bank-details", done: true },
    { step: "invoice-prefix", done: false },
    { step: "staff", done: false },
  ],
  done: false,
};

function renderHome(me: SignedInMember, modules: string[] = ["crm"]) {
  const api = stubApi({
    "organization.setup.get": { data: halfway },
    "leads.stageBreakdown": { data: breakdown },
    "today.summary": { data: busyDay },
    "sales.hotLeads": { data: [] },
  });
  renderWithApi(<HomePage />, newQueryClient({ ...paidSubscription, modules: modules as never }), me);
  return api;
}

beforeEach(() => {
  screenIs("wide");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("makes the period filter the header's action, This month chosen, and has no New lead or Pipeline button", async () => {
    renderHome(member({ isOwner: true }));
    const group = await screen.findByRole("radiogroup", { name: period.label });
    const chips = within(group).getAllByRole("radio");
    expect(chips.map((chip) => chip.textContent)).toEqual([period.today, period.week, period.month, period.all]);
    expect(within(group).getByRole("radio", { name: period.month })).toBeChecked();
    expect(screen.queryByRole("link", { name: messages.leads.newLead })).toBeNull();
    expect(screen.queryByRole("link", { name: "Pipeline" })).toBeNull();
  });

  it("asks for the chosen period, and the stage cards open the list at it", async () => {
    renderHome(member({ isOwner: true }));
    const card = await screen.findByRole("region", { name: messages.home.leads.title });
    expect(await within(card).findByRole("link", { name: /^Won/ })).toHaveAttribute(
      "href",
      "/leads?view=everyone&stage=won&created=month",
    );
    await userEvent.setup().click(screen.getByRole("radio", { name: period.today }));
    await waitFor(() => {
      expect(within(card).getByRole("link", { name: /^Won/ })).toHaveAttribute(
        "href",
        "/leads?view=everyone&stage=won&created=today",
      );
    });
    expect(sentBodies().some((sent) => sent.includes("stageBreakdown") && sent.includes("today"))).toBe(true);
  });

  it("puts the setup card above the leads card", async () => {
    renderHome(member({ isOwner: true }));
    const setup = await screen.findByRole("region", { name: setupCardName });
    const card = await screen.findByRole("region", { name: messages.home.leads.title });
    expect(setup.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no leads card, and asks for no counts, without leads:view or off the crm plan", async () => {
    const api = renderHome(member({ permissions: ["settings:manage"] }));
    expect(await screen.findByRole("region", { name: setupCardName })).toBeVisible();
    expect(screen.queryByRole("region", { name: messages.home.leads.title })).toBeNull();
    expect(api.calls).not.toContain("leads.stageBreakdown");
  });

  it("greets a titled name by the first name, not the title", async () => {
    renderHome(member({ isOwner: true, name: "Mr. Anish Sharma" }));
    expect(await screen.findByRole("heading", { level: 1, name: /, Anish$/ })).toBeVisible();
  });
});
