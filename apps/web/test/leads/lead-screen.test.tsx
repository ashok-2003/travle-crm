// A lead's page laid out (spec 3.4; the lead page's revamp, 2026-11-21): the header and the stage across the page, then
// the lead's parts in the order a salesperson asks. From 1280px two columns: on the left the AI's suggestion,
// Follow-ups, the trip, the chat and the rest, scrolling with the page; on the right, sticky at the screen's height, the
// AI's guess over the timeline. Narrower one column in the phone's order, and on a phone a bar at the screen's foot with
// Call, WhatsApp and Note. The person's card is gone. jsdom has no layout, so these read the structure and the classes
// that place it.
import type { LeadInsight } from "@travel-crm/contracts/ai";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadScreen } from "@/leads/lead/lead-screen";
import { paidSubscription } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { address } from "./navigation";
import { aLead, aTimeline, ids } from "./records";
import { renderScreen } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { lead: words } = messages.leads;

const insight: LeadInsight = {
  score: 65,
  label: "warm",
  reasons: ["Gave dates"],
  fake: false,
  fakeReason: null,
  summary: "Wants Kashmir in December.",
  nextStep: "Send two options.",
  chatSummary: null,
  updatedAt: "2026-11-12T08:00:00.000Z",
};

const suggestion = {
  id: "0199e7a0-0000-7000-8000-0000000000e1",
  leadId: ids.rahul,
  name: "Rahul",
  kind: "not_a_lead",
  lostReason: null,
  reason: "Asked for a job, not a trip.",
  createdAt: "2026-11-12T08:00:00.000Z",
};

/** The screen as wide as `width` says, by the media queries the page asks. */
function screenWidth(width: number) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const least = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: least === null ? false : width >= Number(least[1]),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }),
  );
}

async function renderLeadScreen(width: number) {
  stubApi({
    "leads.get": { data: aLead() },
    "leads.timeline": aTimeline([]),
    "ai.leadInsight": { data: { insight } },
    "ai.leadStageSuggestion": { data: { suggestion } },
  });
  renderScreen(<LeadScreen leadId={ids.rahul} />, {
    width: width >= 768 ? "wide" : "phone",
    subscription: { ...paidSubscription, modules: ["ai"] },
  });
  screenWidth(width);
  await screen.findByRole("region", { name: words.timeline.title });
  await screen.findByRole("region", { name: messages.ai.insight.title });
  return screen.findByRole("region", { name: "The AI suggests marking this lead Not a lead" });
}

/** The page's parts by name, in the order they are in the page. */
const parts = () =>
  screen
    .getAllByRole("region")
    .filter((region) => region.parentElement?.closest("[data-column]") !== null)
    .map((region) => region.getAttribute("aria-label") ?? region.querySelector("h2")?.textContent ?? "")
    .filter((name) => !name.startsWith("Stage"));

beforeEach(() => {
  address.set(`/leads/${ids.rahul}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LeadScreen's layout", () => {
  it("from 1280px: the cards on the left; the AI's guess over the timeline on the right, sticky at the screen's height", async () => {
    screenWidth(1440);
    await renderLeadScreen(1440);
    const timeline = screen.getByRole("region", { name: words.timeline.title });
    const history = timeline.closest("[data-column=history]");
    const cards = screen.getByRole("region", { name: words.followUps.title }).closest("[data-column=cards]");
    expect(history).toHaveClass("sticky", "top-6", "h-[calc(100svh-3rem)]");
    expect(history?.parentElement).toBe(cards?.parentElement);
    expect(history?.parentElement).toHaveClass("grid", "grid-cols-[minmax(0,3fr)_minmax(0,2fr)]", "items-start");
    expect(within(history as HTMLElement).getAllByRole("region", { name: /./ })[0]).toHaveAccessibleName(
      messages.ai.insight.title,
    );
    expect(cards).toContainElement(
      screen.getByRole("region", { name: "The AI suggests marking this lead Not a lead" }),
    );
    expect(cards).toContainElement(screen.getByRole("region", { name: words.trip.title }));
    expect(cards).toContainElement(screen.getByRole("region", { name: words.owner.title }));
    // The timeline's entries scroll in their own box, so the history never pushes the page.
    expect(within(timeline).getByRole("region", { name: words.timeline.entries })).toHaveClass("overflow-y-auto");
    expect(screen.queryByRole("group", { name: words.actionBar.label.replace("{name}", "Rahul Sharma") })).toBeNull();
  });

  it("on a phone: one column in the salesperson's order, and Call, WhatsApp and Note in a bar at the foot", async () => {
    screenWidth(390);
    await renderLeadScreen(390);
    expect(parts()).toEqual([
      "The AI suggests marking this lead Not a lead",
      words.followUps.title,
      words.trip.title,
      messages.ai.insight.title,
      words.timeline.title,
      words.owner.title,
    ]);
    // No card for the person: their contacts are in the header, their Edit in the ⋯ menu.
    expect(screen.queryByRole("region", { name: "The person" })).toBeNull();
    const bar = screen.getByRole("group", { name: words.actionBar.label.replace("{name}", "Rahul Sharma") });
    expect(bar).toHaveAttribute("data-lead-action-bar");
    expect(bar).toHaveClass("sticky", "bottom-[var(--phone-navigation-height,0px)]");
    expect(within(bar).getByRole("link", { name: "Call Rahul Sharma" })).toHaveAttribute("href", "tel:+919876543210");
    expect(within(bar).getByRole("link", { name: "WhatsApp Rahul Sharma" })).toBeVisible();
    // The header leaves Call and WhatsApp to the bar.
    expect(screen.getAllByRole("link", { name: "Call Rahul Sharma" })).toHaveLength(1);
    // Note brings the note box into use.
    await userEvent.click(within(bar).getByRole("button", { name: words.actionBar.note }));
    await waitFor(() => {
      expect(screen.getByLabelText(words.timeline.addNote)).toHaveFocus();
    });
    expect(screen.getByRole("button", { name: words.timeline.saveNote })).toBeVisible();
  });

  it("between 768 and 1280px: the phone's one column, without the bar", async () => {
    screenWidth(1024);
    await renderLeadScreen(1024);
    expect(parts()).toEqual([
      "The AI suggests marking this lead Not a lead",
      words.followUps.title,
      words.trip.title,
      messages.ai.insight.title,
      words.timeline.title,
      words.owner.title,
    ]);
    expect(screen.queryByRole("group", { name: words.actionBar.label.replace("{name}", "Rahul Sharma") })).toBeNull();
    // Call and WhatsApp are the header's again (Call opens the call panel on a screen this wide).
    expect(screen.getByRole("button", { name: "Call Rahul Sharma" })).toBeVisible();
  });
});
