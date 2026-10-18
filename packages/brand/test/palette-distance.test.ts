// Stage and role colours never pass for another colour's meaning (DESIGN.md "Stage Colours", "Role Badges"): every
// value keeps a CIE76 colour difference (ΔE76) of at least 8 from the action, people, money and status colours, a stage
// from the other stages, and a role from the stages too. ΔE76 2.3 is about the smallest difference an eye sees; at 8
// two tints read as different colours side by side, where a near-copy (1.5, the old Booking requested beside the
// action tint) passes for the same one.
import { describe, expect, it } from "vitest";
import { brand } from "../src/index.js";

const MINIMUM_DIFFERENCE = 8;

/** A "#rrggbb" colour in CIELAB (D65), through linear sRGB and XYZ. */
function lab(hex: string): [number, number, number] {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047;
  const y = 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
  const z = (0.0193339 * red + 0.119192 * green + 0.9503041 * blue) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function difference(one: string, other: string): number {
  const [a, b] = [lab(one), lab(other)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Every colour of a palette entry, named by where it is ("stage.new.fill"). */
function values(prefix: string, palette: Record<string, Record<string, string>>): [string, string][] {
  return Object.entries(palette).flatMap(([name, colours]) =>
    Object.entries(colours).map(([part, value]): [string, string] => [`${prefix}.${name}.${part}`, value]),
  );
}

const { colours } = brand;
const reserved: [string, string][] = [
  ...(
    [
      "action",
      "actionPressed",
      "actionTint",
      "people",
      "peoplePressed",
      "peopleTint",
      "peopleTintInk",
      "money",
      "moneyPressed",
      "moneyTint",
    ] as const
  ).map((name): [string, string] => [name, colours[name]]),
  ...values("status", colours.status),
];
const stages = values("stage", colours.stage);
const roles = values("role", colours.role);

/** The pairs closer than the minimum, as "one ~ other: difference". */
function tooClose(ours: [string, string][], theirs: [string, string][]): string[] {
  return ours.flatMap(([name, value]) =>
    theirs
      .filter(([other]) => other.split(".").slice(0, 2).join(".") !== name.split(".").slice(0, 2).join("."))
      .filter(([, otherValue]) => difference(value, otherValue) < MINIMUM_DIFFERENCE)
      .map(([other, otherValue]) => `${name} ~ ${other}: ${difference(value, otherValue).toFixed(1)}`),
  );
}

describe("palette distance", () => {
  it("measures ΔE76 as CIELAB does", () => {
    expect(difference("#000000", "#ffffff")).toBeCloseTo(100, 1);
    expect(difference("#2563eb", "#2563eb")).toBe(0);
    // The old Booking requested tint beside the action tint: a near-copy.
    expect(difference("#edeffe", "#eef2ff")).toBeLessThan(2);
  });

  it("keeps every stage colour apart from the action, people, money and status colours and the other stages", () => {
    expect(tooClose(stages, [...reserved, ...stages])).toEqual([]);
  });

  it("keeps every role colour apart from those and from the stages, so a role never looks like a state", () => {
    expect(tooClose(roles, [...reserved, ...stages])).toEqual([]);
  });
});
