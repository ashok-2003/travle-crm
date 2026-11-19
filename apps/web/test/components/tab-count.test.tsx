// A tab's count is a small red pill (owner, 2026-11-19), in the bad status's fill and ink, and nothing for none.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabCount } from "@/components/tab-count";

describe("TabCount", () => {
  it("shows the number in red, grouped the Indian way", () => {
    render(<TabCount count={1450} />);
    expect(screen.getByText("1,450")).toHaveClass("bg-status-bad-fill", "text-status-bad-ink");
  });

  it("shows nothing for none", () => {
    const { container } = render(<TabCount count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
