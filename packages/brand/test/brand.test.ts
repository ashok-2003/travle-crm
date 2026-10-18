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

  it("keeps stages off the action and money colours, and roles off the status and stage colours", () => {
    const { colours } = brand;
    const values = (palette: Record<string, object>) =>
      new Set(Object.values(palette).flatMap((colour) => leaves(colour).map(([, value]) => value)));
    const reserved = new Set([
      colours.action,
      colours.actionPressed,
      colours.actionTint,
      colours.money,
      colours.moneyTint,
    ]);
    for (const value of values(colours.stage)) expect(reserved.has(value), value).toBe(false);
    const statusAndStage = new Set([...values(colours.status), ...values(colours.stage)]);
    for (const value of values(colours.role)) expect(statusAndStage.has(value), value).toBe(false);
  });

  it("has contacts that parse, and no phone until the owner gives a real one", () => {
    expect(new URL(brand.website).protocol).toBe("https:");
    expect(brand.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
    // A phone, once there is one, is E.164: never the placeholder zeros the screens showed.
    if (brand.supportPhone !== null) {
      expect(brand.supportPhone).toMatch(/^\+[1-9][0-9]{7,14}$/);
      expect(brand.supportPhone).not.toMatch(/^\+910+$/);
    }
    expect(brand.supportPhone).toBeNull();
  });
});
