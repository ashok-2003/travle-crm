// A row's action as its icon alone (web revamp part 2): the registry Button at icon-sm, 32px to see with a 44px hit
// area, named by its aria-label and showing the same words in a tooltip on focus; quiet unless the row's main move.
// GlyphButton is the same without the tooltip (Call, WhatsApp).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { GlyphButton, IconButton } from "@/components/icon-button";
import { targetSize } from "./touch-targets";

// An open tooltip measures itself; jsdom can't.
const noop = () => undefined;
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  },
);

describe("IconButton", () => {
  it("is named, icon-sm and quiet, 44px to hit, with its name in a tooltip on focus", async () => {
    render(
      <IconButton aria-label="Snooze: Call Priya">
        <CheckIcon aria-hidden="true" />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Snooze: Call Priya" });
    expect(button).toHaveTextContent(/^$/);
    expect(button).toHaveAttribute("data-size", "icon-sm");
    expect(button).toHaveAttribute("data-variant", "quiet");
    expect(targetSize(button)).toEqual({ width: 44, height: 44 });
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Snooze: Call Priya");
  });

  it("takes a variant, and a link in place of the button", () => {
    render(
      <>
        <IconButton variant="ghost" aria-label="Done: Call Priya">
          <CheckIcon aria-hidden="true" />
        </IconButton>
        <IconButton asChild aria-label="Call Priya">
          <a href="tel:+919812345678">
            <CheckIcon aria-hidden="true" />
          </a>
        </IconButton>
      </>,
    );
    expect(screen.getByRole("button", { name: "Done: Call Priya" })).toHaveAttribute("data-variant", "ghost");
    const link = screen.getByRole("link", { name: "Call Priya" });
    expect(link).toHaveAttribute("href", "tel:+919812345678");
    expect(link).toHaveAttribute("data-size", "icon-sm");
  });

  it("as a GlyphButton shows no tooltip, still named and icon-sm", async () => {
    render(
      <GlyphButton aria-label="Call Priya">
        <CheckIcon aria-hidden="true" />
      </GlyphButton>,
    );
    const button = screen.getByRole("button", { name: "Call Priya" });
    expect(button).toHaveAttribute("data-size", "icon-sm");
    expect(targetSize(button)).toEqual({ width: 44, height: 44 });
    await userEvent.tab();
    expect(button).toHaveFocus();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
