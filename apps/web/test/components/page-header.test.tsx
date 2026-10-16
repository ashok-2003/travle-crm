// The one screen header: the h1, the intro under it, and the action after both, which is what puts it under the intro
// on phones; from tablets up the row puts it at the right. Without an action there is no row at all.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/page-header";

describe("PageHeader", () => {
  it("is the screen's h1, its intro and then its action, at the right from tablets up", () => {
    const { container } = render(
      <PageHeader title="Staff" intro="Everyone who works here." action={<button>Add staff</button>} />,
    );
    const title = screen.getByRole("heading", { level: 1, name: "Staff" });
    const intro = screen.getByText("Everyone who works here.");
    const action = screen.getByRole("button", { name: "Add staff" });
    expect(title.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intro.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.parentElement).toHaveClass("gap-2");
    expect(container.firstElementChild).toHaveClass("flex-col", "md:flex-row", "md:justify-between");
    expect(title.parentElement?.contains(action)).toBe(false);
  });

  it("is the title and intro alone when the screen has no action", () => {
    const { container } = render(<PageHeader title="Audit log" intro="Every change." />);
    expect(container.firstElementChild).toBe(screen.getByRole("heading", { level: 1 }).parentElement);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("can be the title alone", () => {
    render(<PageHeader title="Settings" />);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" }).parentElement?.children).toHaveLength(1);
  });
});
