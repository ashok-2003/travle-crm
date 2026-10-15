// The brand's values are well formed: colours are hex codes, contacts parse, and the name is set.
import { describe, expect, it } from "vitest";
import { brand } from "../src/index.js";

/** Every string value in a nested object, with its path, e.g. ["colours.status.good.ink", "#14532d"]. */
function leaves(value: object, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") return [[path, child] as [string, string]];
    return child !== null && typeof child === "object" ? leaves(child, path) : [];
  });
}

describe("brand", () => {
  it("has a product name and a shorter short name", () => {
    expect(brand.productName.length).toBeGreaterThan(0);
    expect(brand.shortName.length).toBeLessThanOrEqual(12);
  });

  it("writes every colour as a six-digit hex code", () => {
    const colours = leaves(brand.colours);
    expect(colours.length).toBeGreaterThan(10);
    for (const [path, colour] of colours) expect(colour, path).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("has contacts that parse", () => {
    expect(new URL(brand.website).protocol).toBe("https:");
    expect(brand.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    expect(brand.supportPhone).toMatch(/^\+[1-9][0-9]{7,14}$/);
  });
});
