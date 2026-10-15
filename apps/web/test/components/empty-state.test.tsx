// What a list shows when it has nothing (DESIGN.md section 6): the sentence, an icon that screen readers skip, and
// the one action.
import { render, screen } from "@testing-library/react";
import { InboxIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/empty-state";

describe("EmptyState", () => {
  it("says what belongs here and offers the action", () => {
    const { container } = render(
      <EmptyState icon={InboxIcon} message="No staff yet." action={<button type="button">Add staff</button>} />,
    );
    expect(screen.getByText("No staff yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add staff" })).toBeVisible();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("works without an action", () => {
    render(<EmptyState icon={InboxIcon} message="Nothing here." />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Nothing here.")).toBeVisible();
  });
});
