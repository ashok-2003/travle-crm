// A status is a dot and a word: the word carries the meaning, the dot is decoration screen readers skip.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  it("shows the word, with a dot hidden from screen readers", () => {
    render(<StatusBadge tone="attention">Payment due</StatusBadge>);
    const badge = screen.getByText("Payment due");
    expect(badge).toHaveClass("bg-status-attention-fill", "text-status-attention-ink");
    const dot = badge.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass("bg-status-attention-dot");
  });
});
