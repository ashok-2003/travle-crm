// The palette meets WCAG 2.2 AA (DESIGN.md section 8): text 4.5:1 on what it sits on, control edges 3:1.
import { describe, expect, it } from "vitest";
import { brand } from "../src/index.js";

/** WCAG relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const { colours } = brand;

describe("contrast", () => {
  it("computes the WCAG ratio", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("gives every text colour 4.5:1 on the surfaces it is used on", () => {
    const textPairs: [string, string, string][] = [
      ["ink on canvas", colours.ink, colours.canvas],
      ["ink on surface", colours.ink, colours.surface],
      ["muted on canvas", colours.muted, colours.canvas],
      ["muted on surface", colours.muted, colours.surface],
      ["action on canvas", colours.action, colours.canvas],
      ["text on action", colours.onAction, colours.action],
      ["text on pressed action", colours.onAction, colours.actionPressed],
      ["pressed action on its tint", colours.actionPressed, colours.actionTint],
      ["text on people", colours.onAction, colours.people],
      ["people ink on its tint", colours.peopleTintInk, colours.peopleTint],
      ["money on canvas", colours.money, colours.canvas],
      ["money on its tint", colours.money, colours.moneyTint],
      ...Object.entries(colours.status).map(([name, status]): [string, string, string] => [
        `${name} status`,
        status.ink,
        status.fill,
      ]),
    ];
    for (const [name, foreground, background] of textPairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives input borders and status dots 3:1 on canvas, as control edges and graphics need", () => {
    expect(contrast(colours.inputBorder, colours.canvas)).toBeGreaterThanOrEqual(3);
    for (const [name, status] of Object.entries(colours.status)) {
      expect(contrast(status.dot, colours.canvas), name).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives status dots 3:1 on their own badge fill, where StatusBadge draws them", () => {
    for (const [name, status] of Object.entries(colours.status)) {
      expect(contrast(status.dot, status.fill), name).toBeGreaterThanOrEqual(3);
    }
  });
});
