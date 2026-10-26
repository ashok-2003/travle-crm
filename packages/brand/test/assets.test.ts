// The logo files are plain SVG marks the icon generator can render: square, drawn with paths, no text.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brandAssets } from "../src/assets.js";
import { brand } from "../src/index.js";

describe("brand assets", () => {
  it("are absolute paths to the two logo files", () => {
    expect(path.isAbsolute(brandAssets.logo)).toBe(true);
    expect(path.basename(brandAssets.logo)).toBe("logo.svg");
    expect(path.basename(brandAssets.logoDark)).toBe("logo-dark.svg");
  });

  it("draw a square mark with paths only, in the brand's ink and warm white", () => {
    for (const [file, mainColour] of [
      [brandAssets.logo, brand.colours.ink],
      [brandAssets.logoDark, brand.colours.canvas],
    ] as const) {
      const svg = readFileSync(file, "utf8");
      const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
      expect(viewBox?.[1], file).toBe(viewBox?.[2]);
      expect(svg, file).not.toMatch(/<(text|image|use|style|script)\b/);
      expect(svg, file).toContain(`fill="${mainColour}"`);
      expect(svg, file).toMatch(/placeholder/i);
    }
  });
});
