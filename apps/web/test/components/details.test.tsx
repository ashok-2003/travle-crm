// Labelled values, compact (DESIGN.md: labels muted, values in ink): each row holds its label and then its value, at
// the row's end, wrapping under the label only when the row is too narrow; an action, if any, after both. No
// separators: the rows' own spacing parts them.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Details } from "@/components/details";

describe("Details", () => {
  it("puts each label and its value on one row, the value at the end, with no separators between rows", () => {
    const { container } = render(
      <Details
        rows={[
          { label: "Name", value: "Sharma Travels" },
          { label: "Code", value: "SHARMA", action: <button>Copy</button> },
        ]}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const [name, code] = rows as [HTMLElement, HTMLElement];
    const label = within(name).getByText("Name");
    const value = within(name).getByText("Sharma Travels");
    expect(label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One wrapping row: the value goes to the end, or under the label when it can't fit beside it.
    expect(label.parentElement).toBe(value.parentElement);
    expect(label.parentElement).toHaveClass("flex-row", "flex-wrap", "justify-between");
    expect(label).toHaveClass("text-muted-foreground");
    expect(within(code).getByRole("button", { name: "Copy" })).toBeVisible();
    expect(container.querySelector("[data-slot=item-separator]")).toBeNull();
  });

  it("shows a label alone when it has no value", () => {
    render(<Details rows={[{ label: "Temporary password" }]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Temporary password");
  });
});
