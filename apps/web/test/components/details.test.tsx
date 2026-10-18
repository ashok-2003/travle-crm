// Labelled values, compact (DESIGN.md: labels muted, values in ink): each row holds its label and then its value, at
// the row's end, wrapping under the label only when the row is too narrow; an action, if any, after both, and then
// the value always under its label. No separators: the rows' own spacing parts them. A label a first-time user may not
// know carries its info hint.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { Details } from "@/components/details";
import { locale, messages } from "@/i18n/messages";

const noop = () => undefined;

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

  it("puts the value under its label in a row with an action, however short, so copy rows read alike", () => {
    render(
      <Details
        rows={[
          { label: "Name", value: "Sharma Travels" },
          { label: "Username", value: "meera", action: <button>Copy</button> },
        ]}
      />,
    );
    const [name, username] = screen.getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(within(name).getByText("Sharma Travels")).not.toHaveClass("basis-full");
    expect(within(username).getByText("meera")).toHaveClass("basis-full");
  });

  it("shows a label alone when it has no value", () => {
    render(<Details rows={[{ label: "Temporary password" }]} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Temporary password");
  });

  it("puts a label's info hint right after the label, asking what the label means", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: noop, removeEventListener: noop }));
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Details rows={[{ label: "Source", value: "Phone call", info: "Where the enquiry came from." }]} />
      </NextIntlClientProvider>,
    );
    const hint = screen.getByRole("button", { name: "What does Source mean?" });
    expect(screen.getByText("Source")).toContainElement(hint);
    vi.unstubAllGlobals();
  });
});
