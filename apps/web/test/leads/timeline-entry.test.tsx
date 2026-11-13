// What the AI did on a lead reads in the timeline with the violet AI chip and the AI's name; a member's own change has none.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { TimelineEntryItem } from "@/leads/lead/timeline-entry";
import { stubApi } from "../support/api-stub";
import { anEntry, ids, people } from "./records";
import { renderScreen } from "./screen";
import type { TimelineEntry } from "@travel-crm/contracts/crm";

function show(entry: TimelineEntry) {
  stubApi({});
  renderScreen(
    <ul>
      <TimelineEntryItem entry={entry} people={people} leadId={ids.rahul} />
    </ul>,
  );
  return screen.getByRole("heading", { level: 3 });
}

describe("the AI in a lead's timeline", () => {
  it("the AI's stage move carries the chip and the AI's name", () => {
    const heading = show(anEntry({ kind: "stage-changed", stage: "quote_sent", byAi: true, actorUserId: null }));
    expect(heading.querySelector("[data-ai-chip]")).toHaveTextContent(messages.ai.chip);
    expect(heading).toHaveTextContent("Moved to Quote sent");
    expect(screen.getByText(/The AI/)).toBeVisible();
  });

  it("a member's stage move has no chip", () => {
    const heading = show(anEntry({ kind: "stage-changed", stage: "quote_sent", byAi: false }));
    expect(heading.querySelector("[data-ai-chip]")).toBeNull();
  });

  it("an AI change reads 'Travel date changed from Sat 14 Nov to Sat 21 Nov' with the chip", () => {
    const heading = show(
      anEntry({ kind: "ai-field-set", field: "when", from: "Sat 14 Nov", to: "Sat 21 Nov", actorUserId: null }),
    );
    expect(heading.querySelector("[data-ai-chip]")).not.toBeNull();
    expect(heading).toHaveTextContent("Travel date changed from Sat 14 Nov to Sat 21 Nov");
    // The heading's name keeps the chip apart from the title.
    expect(screen.getByRole("heading", { name: "AI Travel date changed from Sat 14 Nov to Sat 21 Nov" })).toBe(heading);
  });

  it("the AI's note carries the chip", () => {
    const heading = show(anEntry({ kind: "note", body: "Wants a houseboat.", byAi: true, actorUserId: null }));
    expect(heading.querySelector("[data-ai-chip]")).not.toBeNull();
  });
});
