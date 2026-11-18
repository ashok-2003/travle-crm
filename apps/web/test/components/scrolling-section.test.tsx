// A section of a busy screen (My tasks, Follow-ups): a fixed-height card that scrolls inside on a wide screen, a
// collapsible with its heading as the trigger on a phone.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollingSection } from "@/components/scrolling-section";
import { screenIs } from "../organization/render";

afterEach(() => {
  vi.unstubAllGlobals();
});

const section = (defaultOpen: boolean) => (
  <ScrollingSection title="Overdue" count={7} defaultOpen={defaultOpen} footer={<p>Footer line</p>}>
    <p>First row</p>
  </ScrollingSection>
);

describe("ScrollingSection", () => {
  it("on a wide screen is a named card with its count and a scroll area, with nothing to collapse", () => {
    screenIs("wide");
    const { container } = render(section(false));
    expect(screen.getByRole("region", { name: "Overdue" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Overdue" })).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
    expect(screen.getByText("First row")).toBeVisible();
    expect(screen.getByText("Footer line")).toBeVisible();
    expect(container.querySelector("[data-slot=scroll-area]")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("on a phone is a collapsible named by the section, closed unless it starts open", async () => {
    screenIs("phone");
    const { unmount, container } = render(section(false));
    const trigger = screen.getByRole("button", { name: "Overdue" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAccessibleDescription("7");
    expect(screen.queryByText("First row")).toBeNull();
    expect(container.querySelector("[data-slot=scroll-area]")).toBeNull();
    await userEvent.click(trigger);
    expect(screen.getByText("First row")).toBeVisible();
    expect(screen.getByText("Footer line")).toBeVisible();
    unmount();
    render(section(true));
    expect(screen.getByRole("button", { name: "Overdue" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("First row")).toBeVisible();
  });
});
