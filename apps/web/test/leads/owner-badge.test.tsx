// A lead's owner (or a task's assignee) in the people tint, never a button; a name the page didn't carry is a former
// member's (R13).
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { OwnerBadge } from "@/leads/owner-badge";
import { renderPiece } from "./render";

describe("OwnerBadge", () => {
  it("names the owner in the people tint, and a former member when the page has no name for them", () => {
    renderPiece(
      <>
        <OwnerBadge name="Asha Sharma" />
        <OwnerBadge name={null} />
      </>,
    );
    expect(screen.getByText("Asha Sharma")).toHaveClass("bg-people-tint", "text-people-tint-ink");
    expect(screen.getByText(messages.leads.formerMember)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
