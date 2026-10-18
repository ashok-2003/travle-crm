// A lead's page laid out (spec 3.4; the owner's feedback of 2026-10-18): the header and the stage across the page, then
// the lead's cards; from 1280px the timeline sits beside the cards instead of under them, and stays in view while they
// scroll when it fits the screen, scrolling with the page when it doesn't. jsdom has no layout, so these read the
// structure and the classes that place it.
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadScreen } from "@/leads/lead/lead-screen";
import { stubApi } from "../support/api-stub";
import { address } from "./navigation";
import { aLead, aTimeline, ids } from "./records";
import { renderScreen } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { lead: words } = messages.leads;

async function renderLeadScreen() {
  stubApi({ "leads.get": { data: aLead() }, "leads.timeline": aTimeline([]) });
  renderScreen(<LeadScreen leadId={ids.rahul} />, { width: "wide" });
  return screen.findByRole("region", { name: words.timeline.title });
}

beforeEach(() => {
  address.set(`/leads/${ids.rahul}`);
  vi.stubGlobal("innerHeight", 900);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LeadScreen's layout", () => {
  it("puts the header and the stage above two columns: the cards, then the timeline beside them from 1280px", async () => {
    const timeline = await renderLeadScreen();
    const cards = [words.work.title, words.person.title, words.trip.title, words.owner.title].map((name) =>
      screen.getByRole("region", { name }),
    );
    const cardsColumn = cards[0]?.parentElement;
    for (const card of cards) expect(card.parentElement).toBe(cardsColumn);
    const columns = cardsColumn?.parentElement;
    expect(timeline.parentElement?.parentElement).toBe(columns);
    expect(timeline.parentElement).not.toBe(cardsColumn);
    expect(columns).toHaveClass("grid", "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]", "xl:items-start");
    // Below 1280px one column, as before: the timeline after the cards.
    expect(cardsColumn?.compareDocumentPosition(timeline) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(columns).not.toContainElement(screen.getByRole("heading", { level: 1, name: "Rahul Sharma" }));
    expect(columns).not.toContainElement(
      screen.getByRole("region", { name: words.stageNamed.replace("{stage}", messages.leads.stages.new) }),
    );
  });

  it("holds the timeline in view while the cards scroll only while it fits the screen", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
    const column = (await renderLeadScreen()).parentElement;
    expect(column).toHaveClass("xl:sticky", "xl:top-6");

    // Taller than the screen (with its room above and below), it scrolls with the page, so all of it can be read.
    height.mockReturnValue(880);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(column).not.toHaveClass("xl:sticky");
  });
});
