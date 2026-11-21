// What the AI did on a lead reads in the timeline with the violet mark, and "AI" for screen readers, and no person's
// name; a member's own change has the stage's mark and their name beside it; the system's entries have neither.
import type { TimelineEntry } from "@travel-crm/contracts/crm";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { TimelineEntryItem } from "@/leads/lead/timeline-entry";
import { stubApi } from "../support/api-stub";
import { anEntry, ids, people } from "./records";
import { renderScreen } from "./screen";

function show(entry: TimelineEntry) {
  stubApi({});
  renderScreen(
    <div role="list">
      <TimelineEntryItem entry={entry} people={people} leadId={ids.rahul} />
    </div>,
  );
  const row = screen.getByRole("listitem");
  return { row, heading: screen.getByRole("heading", { level: 4 }), mark: row.querySelector("[data-mark]") };
}

describe("the AI in a lead's timeline", () => {
  it("the AI's stage move wears the violet mark, reads 'AI' first, and names nobody", () => {
    const { row, heading, mark } = show(
      anEntry({ kind: "stage-changed", stage: "quote_sent", byAi: true, actorUserId: null }),
    );
    expect(mark).toHaveClass("bg-people-tint", "text-people-tint-ink");
    expect(heading).toHaveAccessibleName(`${messages.leads.lead.timeline.aiMark} Moved to Quote sent`);
    expect(row).not.toHaveTextContent("Ravi Kumar");
  });

  it("a member's stage move wears its stage's colour, with their name beside it", () => {
    const { row, heading, mark } = show(anEntry({ kind: "stage-changed", stage: "quote_sent", byAi: false }));
    expect(mark).toHaveClass("bg-status-attention-fill");
    expect(heading).toHaveAccessibleName("Moved to Quote sent");
    expect(row).toHaveTextContent("Moved to Quote sent · Ravi Kumar");
  });

  it("an AI change reads 'Travel date changed from Sat 14 Nov to Sat 21 Nov' as the AI's", () => {
    const { heading, mark } = show(
      anEntry({ kind: "ai-field-set", field: "when", from: "Sat 14 Nov", to: "Sat 21 Nov", actorUserId: null }),
    );
    expect(mark).toHaveClass("bg-people-tint");
    expect(screen.getByRole("heading", { name: "AI Travel date changed from Sat 14 Nov to Sat 21 Nov" })).toBe(heading);
  });

  it("the AI's note is the AI's, and its words show under it", () => {
    const { heading, mark } = show(
      anEntry({ kind: "note", body: "Wants a houseboat.", byAi: true, actorUserId: null }),
    );
    expect(mark).toHaveClass("bg-people-tint");
    expect(heading).toHaveAccessibleName(messages.leads.lead.timeline.aiNote);
    expect(screen.getByText("Wants a houseboat.")).toBeVisible();
  });

  it("the system's own entry is a small grey dot and a caption, without a name", () => {
    const { row, mark } = show(anEntry({ kind: "trip-edited", actorUserId: null }));
    expect(mark?.querySelector("span")).toHaveClass("size-1.5", "bg-status-neutral-dot");
    expect(row.querySelector(".text-caption")).toHaveTextContent(messages.leads.lead.timeline.tripEdited);
    expect(row).toHaveTextContent(/^Trip details changed10:42 am$/);
  });
});
