// A lead's page, its top (spec 3.4, R26, R48): the person's name, their phone, email and handle under it, and Call and
// WhatsApp only when there is a phone; the way back to Leads keeps the list's filters; a lead out of reach is "not
// found", never a hint that it exists; a failure says so with Try again.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadHeader } from "@/leads/lead/lead-header";
import { LeadScreen } from "@/leads/lead/lead-screen";
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
    const { unmount } = renderScreen(<LeadHeader lead={withPhone} />);
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
    expect(screen.getByRole("link", { name: "Call Rahul Sharma" })).toHaveAttribute("href", "tel:+919876543210");
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
    );
    expect(screen.getByText("rahul.s@gmail.com")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "What does Returning mean?" })).not.toBeInTheDocument();
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
