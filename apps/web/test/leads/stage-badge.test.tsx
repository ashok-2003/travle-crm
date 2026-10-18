// A lead's stage as a badge (DESIGN.md "Stage Colours"): each stage in its own subtle colour, fixed by meaning (Won
// green, Lost red, Not a lead neutral, Quote sent amber), always a dot and the stage's word. StageDot is the dot alone,
// for the chips, the Filters' stage list and the timeline.
import { leadStages, type LeadStage } from "@travel-crm/contracts/crm";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { StageBadge, StageDot, stageTones } from "@/leads/stage-badge";
import { renderPiece } from "./render";

const colours: Record<LeadStage, { fill: string; dot: string }> = {
  new: { fill: "bg-stage-new-fill", dot: "bg-stage-new-dot" },
  contacted: { fill: "bg-stage-contacted-fill", dot: "bg-stage-contacted-dot" },
  quote_sent: { fill: "bg-status-attention-fill", dot: "bg-status-attention-dot" },
  booking_requested: { fill: "bg-stage-booking-requested-fill", dot: "bg-stage-booking-requested-dot" },
  won: { fill: "bg-status-good-fill", dot: "bg-status-good-dot" },
  lost: { fill: "bg-status-bad-fill", dot: "bg-status-bad-dot" },
  not_a_lead: { fill: "bg-status-neutral-fill", dot: "bg-status-neutral-dot" },
};

describe("StageBadge", () => {
  it("shows each stage in its own colour, Won green and Lost red, with a dot and its word", () => {
    renderPiece(
      <>
        {leadStages.map((stage) => (
          <StageBadge key={stage} stage={stage} />
        ))}
      </>,
    );
    for (const stage of leadStages) {
      const badge = screen.getByText(messages.leads.stages[stage]);
      expect(badge, stage).toBeVisible();
      expect(badge, stage).toHaveClass(colours[stage].fill);
      expect(badge.querySelector("[aria-hidden=true]"), stage).toHaveClass(colours[stage].dot);
    }
  });

  it("gives every stage a different colour, its badge, its dot and its passed segment", () => {
    const tones = leadStages.map((stage) => stageTones[stage]);
    for (const part of ["badge", "dot", "passed"] as const) {
      expect(new Set(tones.map((tone) => tone[part])).size, part).toBe(leadStages.length);
    }
  });
});

describe("StageDot", () => {
  it("is the stage's dot alone, decoration beside the words that name it", () => {
    const { container } = renderPiece(<StageDot stage="contacted" />);
    const dot = container.firstElementChild;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("bg-stage-contacted-dot");
  });
});
