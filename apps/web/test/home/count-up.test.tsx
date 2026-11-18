// The chats-answered figure counts up from 0, and stays still under prefers-reduced-motion.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CountUp } from "@/home/count-up";
import { screenIs } from "../organization/render";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CountUp", () => {
  it("starts the visible figure at 0 and says the real value to screen readers at once", () => {
    screenIs("phone");
    const { container } = render(<CountUp value={1234} />);
    expect(screen.getByText("1,234")).toHaveClass("sr-only");
    expect(container.querySelector("[aria-hidden=true]")?.textContent).toBe("0");
  });

  it("shows the value with no animation when the member prefers reduced motion", () => {
    screenIs("wide");
    const { container } = render(<CountUp value={1234} />);
    expect(container.textContent).toBe("1,234");
    expect(container.querySelector("[aria-hidden=true]")).toBeNull();
  });
});
