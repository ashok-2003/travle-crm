// A lead's page laid out (spec 3.4; the owner's feedback of 2026-10-18): the header and the stage across the page, then
// the lead's cards; from 1280px the timeline sits beside the cards instead of under them and always sticks: 24px from
// the top while it fits the screen, and otherwise far enough up that its end comes into view, so a note that makes it
// taller never makes it jump. jsdom has no layout, so these read the structure and the styles that place it.
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

/** The timeline column's size watchers, which a test calls as the browser would after a resize. */
let resized: (() => void)[] = [];

beforeEach(() => {
  address.set(`/leads/${ids.rahul}`);
  resized = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized.push(callback);
      }
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
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

  it("always holds the timeline in view: 24px from the top, or as high as shows its end when it is taller", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
    const column = (await renderLeadScreen()).parentElement;
    expect(column).toHaveClass("xl:sticky", "xl:top-(--timeline-top)");
    expect(column?.style.getPropertyValue("--timeline-top")).toBe("min(1.5rem, calc(100svh - 600px - 1.5rem))");

    // A note makes it taller than the screen: it stays sticky (no jump), its top moving up so its end can be read.
    height.mockReturnValue(1400);
    act(() => {
      for (const callback of resized) callback();
    });
    expect(column).toHaveClass("xl:sticky");
    expect(column?.style.getPropertyValue("--timeline-top")).toBe("min(1.5rem, calc(100svh - 1400px - 1.5rem))");
  });
});
