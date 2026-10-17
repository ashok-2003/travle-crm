// A lead's stage as a badge (R43): grey while open, green for Won, red for Lost, always a dot and the stage's word.
import { leadStages } from "@travel-crm/contracts/crm";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { StageBadge } from "@/leads/stage-badge";
import { renderPiece } from "./render";

describe("StageBadge", () => {
  it("shows Lost red, Won green and open stages grey, each with its word", () => {
    renderPiece(
      <>
        {leadStages.map((stage) => (
          <StageBadge key={stage} stage={stage} />
        ))}
      </>,
    );
    expect(screen.getByText("Lost")).toHaveClass("bg-status-bad-fill");
    expect(screen.getByText("Won")).toHaveClass("bg-status-good-fill");
    for (const stage of ["new", "contacted", "quote_sent", "booking_requested", "not_a_lead"] as const) {
      expect(screen.getByText(messages.leads.stages[stage])).toHaveClass("bg-status-neutral-fill");
    }
    expect(screen.getByText("Quote sent")).toBeVisible();
    expect(screen.getByText("Booking requested")).toBeVisible();
    expect(screen.getByText("Not a lead")).toBeVisible();
  });
});
