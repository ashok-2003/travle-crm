// A lead's page, its top (spec 3.4, R26, R48; the lead page's revamp, 2026-11-21): the person's name; their phone, email
// and handle under it; the trip in one line; how warm the lead is (the AI's guess in violet, and why it is hot); Call and
// WhatsApp only when there is a phone, in the header from tablets up (on a phone they are in the bar at the foot), and
// Edit person in the ⋯ menu; the way back to Leads keeps the list's filters; a lead out of reach is "not found", never a
// hint that it exists; a failure says so with Try again.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadHeader } from "@/leads/lead/lead-header";
import { LeadScreen } from "@/leads/lead/lead-screen";
import { paidSubscription } from "../organization/api";
import { stubApi, type Answer } from "../support/api-stub";
import { address } from "./navigation";
import { aLead, aTimeline, ids } from "./records";
import { renderScreen } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { lead: words } = messages.leads;

function renderLeadScreen(answers: Record<string, Answer> = {}) {
  stubApi({ "leads.get": { data: aLead() }, "leads.timeline": aTimeline([]), ...answers });
  renderScreen(<LeadScreen leadId={ids.rahul} />);
}

beforeEach(() => {
  address.set(`/leads/${ids.rahul}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadHeader", () => {
  it("shows Call and WhatsApp only with a phone, the email and handle under the name, and Returning with its hint", async () => {
    stubApi({});
    const withPhone = aLead({
      returning: true,
      person: {
        id: ids.person,
        name: "Rahul Sharma",
        phone: "+919876543210",
        email: "rahul.s@gmail.com",
        instagramHandle: "rahul.travels",
      },
    });
    const phone = renderScreen(<LeadHeader lead={withPhone} />);
    expect(screen.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
    expect(screen.getByText("+91 98765 43210")).toBeVisible();
    expect(screen.getByText("rahul.s@gmail.com")).toBeVisible();
    expect(screen.getByText("@rahul.travels")).toBeVisible();
    expect(screen.getByText(messages.leads.returning)).toBeVisible();
    // Returning is a term a first-time user may not know: its info hint says what it means.
    await userEvent.click(screen.getByRole("button", { name: "What does Returning mean?" }));
    expect(await screen.findByRole("dialog", { name: messages.leads.returning })).toHaveAccessibleDescription(
      messages.leads.hints.returning,
    );
    phone.unmount();

    const { unmount } = renderScreen(<LeadHeader lead={withPhone} />, { width: "wide" });
    // A screen this wide has no dialler: Call opens the call panel.
    expect(screen.getByRole("button", { name: "Call Rahul Sharma" })).toBeVisible();
    expect(screen.getByRole("link", { name: "WhatsApp Rahul Sharma" })).toHaveAttribute(
      "href",
      "https://wa.me/919876543210",
    );
    unmount();

    renderScreen(
      <LeadHeader
        lead={aLead({
          person: {
            id: ids.person,
            name: "Rahul Sharma",
            phone: null,
            email: "rahul.s@gmail.com",
            instagramHandle: null,
          },
        })}
      />,
      { width: "wide" },
    );
    expect(screen.getByText("rahul.s@gmail.com")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Call/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What does Returning mean?" })).not.toBeInTheDocument();
  });

  it("puts the trip in one line, and how warm the lead is: the AI's guess in violet and why it is hot", async () => {
    stubApi({
      "ai.leadInsight": {
        data: {
          insight: {
            score: 65,
            label: "warm",
            reasons: [],
            fake: false,
            fakeReason: null,
            summary: "",
            nextStep: "",
            chatSummary: null,
            updatedAt: "2026-11-12T08:00:00.000Z",
          },
        },
      },
      "sales.forLead": { data: { heat: { score: 80, reasons: ["quote_opened"] }, cadence: null } },
    });
    const lead = aLead({ trip: { ...aLead().trip, when: { kind: "month", month: "2027-01" } } });
    renderScreen(<LeadHeader lead={lead} />, { width: "wide", subscription: { ...paidSubscription, modules: ["ai"] } });
    expect(document.querySelector("[data-line=trip]")).toHaveTextContent("Kashmir · Jan 2027 · 2 adults, 1 child");
    const warmth = document.querySelector<HTMLElement>("[data-line=warmth]");
    if (warmth === null) throw new Error("No warmth line");
    await waitFor(() => {
      expect(warmth.querySelector("[data-temperature]")).toHaveTextContent("Warm 65%");
    });
    expect(warmth.querySelector("[data-temperature]")).toHaveClass("bg-people-tint");
    expect(await within(warmth).findByText(messages.sales.lead.hot)).toBeVisible();
    expect(within(warmth).getByText(messages.sales.hot.reasons.quote_opened)).toBeVisible();
  });

  it("shows no warmth before the AI has scored the lead, nor when it isn't hot", async () => {
    const api = stubApi({ "sales.forLead": { data: { heat: { score: 0, reasons: [] }, cadence: null } } });
    renderScreen(<LeadHeader lead={aLead()} />, { width: "wide" });
    await waitFor(() => {
      expect(api.calls).toContain("sales.forLead");
    });
    expect(document.querySelector("[data-line=warmth]")).toBeEmptyDOMElement();
  });

  it("leaves Call and WhatsApp to the bar at the foot on a phone, keeping Messages and the ⋯ menu", () => {
    stubApi({});
    renderScreen(<LeadHeader lead={aLead()} />);
    expect(screen.queryByRole("link", { name: "Call Rahul Sharma" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "WhatsApp Rahul Sharma" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: words.menu.label.replace("{name}", "Rahul Sharma") })).toBeVisible();
  });
});

describe("LeadScreen", () => {
  it("opens with the lead's header and stage, and the way back keeps the list's filters", async () => {
    address.set(`/leads/${ids.rahul}?view=everyone&stage=new`);
    renderLeadScreen();
    expect(await screen.findByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: words.stageNamed.replace("{stage}", messages.leads.stages.new) }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute("href", "/leads?view=everyone&stage=new");
  });

  it("says 'not found' for a lead out of reach", async () => {
    renderLeadScreen({ "leads.get": { status: 404, reason: "NOT_FOUND" } });
    expect(await screen.findByText(words.notFound)).toBeVisible();
    expect(screen.queryByRole("button", { name: messages.common.tryAgain })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute("href", "/leads");
  });

  it("says 'not found' for an address that isn't a lead's, without asking", async () => {
    stubApi({});
    renderScreen(<LeadScreen leadId="not-a-lead" />);
    expect(await screen.findByText(words.notFound)).toBeVisible();
  });

  it("says when the lead didn't load, with Try again", async () => {
    const api = stubApi({ "leads.get": "offline", "leads.timeline": aTimeline([]) });
    renderScreen(<LeadScreen leadId={ids.rahul} />);
    const failure = await screen.findByText(words.loadFailed);
    expect(failure).toBeVisible();
    api.answer("leads.get", { data: aLead() });
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  });
});
