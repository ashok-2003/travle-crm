// Home (spec 3.1, the mockup): the owner's setup card stays first; right under it, for whoever's role sees leads on a
// plan with the crm module, the day's nudge ("8 things today · 2 overdue", three things, Open Today); New lead as the
// header's outline action for whoever may add leads, so Open Today stays the main button. Never Today's long list.
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

function renderHome(me: SignedInMember, { crm = true } = {}) {
  const { calls } = stubApi({ "organization.setup.get": { data: halfway }, "today.summary": { data: busyDay } });
  const queryClient = newQueryClient({ ...paidSubscription, modules: crm ? ["crm"] : [] });
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
  it("keeps the setup card first, then '8 things today · 2 overdue', three items and Open Today", async () => {
    renderHome(member({ isOwner: true }));
    const setupCard = await screen.findByRole("region", { name: setupCardName });
    const card = await nudge();
    expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent("8 things today2 overdue");
    expect(within(within(card).getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
    expect(within(card).getByRole("link", { name: words.open })).toHaveAttribute("href", routes.today);
    // The setup card, then the nudge, then the usual Home.
    const usualHome = screen.getByText(messages.shell.home.intro);
    expect(setupCard.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(usualHome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Open Today is the main button; nothing else on Home is.
    expect(within(card).getByRole("link", { name: words.open }).dataset.variant).toBe("default");
  });

  it("gives New lead as the header's outline action to leads:create", async () => {
    renderHome(ofStarterRole("sales"));
    const newLead = screen.getByRole("link", { name: messages.leads.newLead });
    expect(newLead).toHaveAttribute("href", routes.newLead);
    expect(newLead.dataset.variant).toBe("outline");
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
});
