// A status is a dot and a word: the word carries the meaning, the dot is decoration screen readers skip.
import { colourTokens } from "../../scripts/brand-css.js";
import { brand } from "@travel-crm/brand";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const tokens = new Set(colourTokens(brand.colours).map(([name]) => name));

describe("StatusBadge", () => {
  it.each(["good", "attention", "bad", "neutral"] as const satisfies StatusTone[])(
    "draws %s with its own fill, ink and dot, all real brand colours",
    (tone) => {
      render(<StatusBadge tone={tone}>Word</StatusBadge>);
      const badge = screen.getByText("Word");
      expect(badge).toHaveClass(`bg-status-${tone}-fill`, `text-status-${tone}-ink`);
      expect(badge.querySelector("[aria-hidden='true']")).toHaveClass(`bg-status-${tone}-dot`);
      for (const part of ["fill", "ink", "dot"])
        expect(tokens, `status-${tone}-${part}`).toContain(`status-${tone}-${part}`);
    },
  );
});
