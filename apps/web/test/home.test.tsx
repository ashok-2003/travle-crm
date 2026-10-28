// Home (spec 3.1, the clearer Home): for whoever's role sees leads on a plan with the crm module, the day's nudge ("8 things
// today · 2 overdue", three things, Open Today) comes first, and the owner's setup card under it; New lead is the header's
// main action for whoever may add leads. Never Today's long list.
import type { SetupChecklist } from "@travel-crm/contracts/profile";
import { starterRoles } from "@travel-crm/domain/identity";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(app)/dashboard/page";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import type { SignedInMember } from "@/session/me-context";
import { newQueryClient, paidSubscription, renderWithApi } from "./organization/api";
import { screenIs } from "./organization/render";
import { stubApi } from "./support/api-stub";
import { member } from "./support/members";
import { busyDay, now } from "./today/records";

const words = messages.today.nudge;
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

/** A member of one of the roles every organization starts with, holding its real permissions. */
function ofStarterRole(key: string) {
  const role = starterRoles.find((starter) => starter.key === key);
  if (!role) throw new Error(`no starter role ${key}`);
  return member({ permissions: role.grants.map((grant) => grant.permission) });
}

function renderHome(
  me: SignedInMember,
  { crm = true, modules = crm ? ["crm"] : [] }: { crm?: boolean; modules?: string[] } = {},
) {
  const { calls } = stubApi({
    "organization.setup.get": { data: halfway },
    "today.summary": { data: busyDay },
    "salesInbox.summary": { data: { waiting: 3, late: 1, unread: 2 } },
    "sales.hotLeads": { data: [] },
    "quotes.moneySummary": {
      data: {
        acceptedCount: 1,
        acceptedPaise: 1,
        receivedPaise: 1,
        outstandingPaise: 3_040_000,
        overduePaise: 0,
        overdueCount: 0,
      },
    },
  });
  const queryClient = newQueryClient({ ...paidSubscription, modules: modules as never });
  const { unmount } = renderWithApi(<HomePage />, queryClient, me);
  return { calls, unmount };
}

const nudge = () => screen.findByRole("region", { name: /things today/ });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("phone");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("puts '8 things today · 2 overdue', three items and Open Today first, then the setup card", async () => {
    renderHome(member({ isOwner: true }));
    const setupCard = await screen.findByRole("region", { name: setupCardName });
    const card = await nudge();
    expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent("8 things today2 overdue");
    expect(within(within(card).getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
    expect(within(card).getByRole("link", { name: words.open })).toHaveAttribute("href", routes.today);
    // The nudge, then the setup card.
    expect(card.compareDocumentPosition(setupCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByRole("link", { name: words.open }).dataset.variant).toBe("default");
  });

  it("gives New lead as the header's main action to leads:create", async () => {
    renderHome(ofStarterRole("sales"));
    const newLead = screen.getByRole("link", { name: messages.leads.newLead });
    expect(newLead).toHaveAttribute("href", routes.newLead);
    expect(newLead.dataset.variant).toBe("default");
    expect(await nudge()).toBeVisible();
  });

  it("gives no New lead to a role that only sees leads, nor off the crm plan", async () => {
    const viewer = renderHome(member({ permissions: ["leads:view"] }));
    expect(await nudge()).toBeVisible();
    expect(screen.queryByRole("link", { name: messages.leads.newLead })).toBeNull();
    viewer.unmount();

    const api = renderHome(member({ isOwner: true }), { crm: false });
    expect(await screen.findByRole("region", { name: setupCardName })).toBeVisible();
    expect(screen.queryByRole("link", { name: messages.leads.newLead })).toBeNull();
    expect(screen.queryByRole("region", { name: /things today/ })).toBeNull();
    expect(api.calls).not.toContain("today.summary");
  });

  it("shows no nudge without leads:view, and no list on Home", async () => {
    const api = renderHome(member({ permissions: ["settings:manage"] }));
    expect(await screen.findByRole("region", { name: setupCardName })).toBeVisible();
    expect(screen.queryByRole("region", { name: /things today/ })).toBeNull();
    expect(api.calls).not.toContain("today.summary");
    api.unmount();

    // With leads, Home holds the three things alone, never Today's sections.
    renderHome(member({ isOwner: true }));
    const card = await nudge();
    await waitFor(() => {
      expect(within(card).getAllByRole("listitem")).toHaveLength(3);
    });
    for (const section of Object.values(messages.today.sections)) {
      expect(screen.queryByRole("region", { name: section })).toBeNull();
    }
  });

  it("shows the key figures as one strip of three, Money to come only to whoever holds the money permission", async () => {
    renderHome(member({ isOwner: true }), { modules: ["crm", "inbox", "quotes"] });
    const strip = await screen.findByRole("region", { name: messages.home.glance.title });
    expect(
      within(strip)
        .getAllByRole("group")
        .map((cell) => cell.getAttribute("aria-label")),
    ).toEqual([messages.home.glance.waiting, messages.home.glance.hot, messages.home.glance.money]);
    expect(await within(strip).findByText("₹30,400")).toBeVisible();
    // No icon of its own per figure, and an info hint on each.
    expect(strip.querySelectorAll("svg").length).toBe(strip.querySelectorAll("button svg").length);
    expect(within(strip).getAllByRole("button")).toHaveLength(3);
  });

  it("shows two figures, and no month so far, to a role without the money permission", async () => {
    const api = renderHome(member({ permissions: ["leads:view", "quotes:view", "inbox:view"] }), {
      modules: ["crm", "inbox", "quotes"],
    });
    const strip = await screen.findByRole("region", { name: messages.home.glance.title });
    expect(within(strip).getAllByRole("group")).toHaveLength(2);
    expect(within(strip).queryByText(messages.home.glance.money)).toBeNull();
    expect(screen.queryByRole("heading", { name: messages.home.month.title })).toBeNull();
    expect(api.calls).not.toContain("quotes.moneySummary");
  });

  it("puts the key figures before the day's nudge", async () => {
    renderHome(member({ isOwner: true }), { modules: ["crm", "inbox", "quotes"] });
    const strip = await screen.findByRole("region", { name: messages.home.glance.title });
    const nudgeCard = await nudge();
    expect(strip.compareDocumentPosition(nudgeCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives the money figure a row of its own on a phone, so an amount up to crores is never clipped", async () => {
    stubApi({
      "organization.setup.get": { data: halfway },
      "today.summary": { data: busyDay },
      "salesInbox.summary": { data: { waiting: 3, late: 1, unread: 2 } },
      "sales.hotLeads": { data: [] },
      "quotes.moneySummary": {
        data: {
          acceptedCount: 1,
          acceptedPaise: 1,
          receivedPaise: 1,
          outstandingPaise: 123_456_789_00,
          overduePaise: 0,
          overdueCount: 0,
        },
      },
    });
    renderWithApi(
      <HomePage />,
      newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "quotes"] as never }),
      member({ isOwner: true }),
    );
    const strip = await screen.findByRole("region", { name: messages.home.glance.title });
    const money = within(strip).getByRole("group", { name: messages.home.glance.money });
    expect(await within(money).findByText("₹12,34,56,789")).toBeVisible();
    // A whole row on a phone (two columns), one of three from a tablet up.
    expect(money.className).toContain("col-span-2");
    expect(money.className).toContain("md:col-span-1");
    expect(strip.querySelector("[data-slot=card-content]")?.className).toContain("grid-cols-2");
  });
});
