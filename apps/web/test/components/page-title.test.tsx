// The screen's one h1 (DESIGN.md section 3): Garamond, 24px on phones and 30px from tablets up.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageTitle } from "@/components/page-title";

describe("PageTitle", () => {
  it("is a level-one heading in the title face and size", () => {
    render(<PageTitle>Staff</PageTitle>);
    const title = screen.getByRole("heading", { level: 1, name: "Staff" });
    expect(title).toHaveClass("font-title", "text-title-mobile", "md:text-title", "font-medium");
  });

  it("takes extra classes without losing its own", () => {
    render(<PageTitle className="mb-4">Staff</PageTitle>);
    expect(screen.getByRole("heading")).toHaveClass("mb-4", "font-title");
  });
});
