// DESIGN.md lists the palette in its front matter and the brand package holds it in code. Code reads only the brand
// package, so this test keeps the two in step: change either one and it fails until the other matches.
import { readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";

const designMd = readFileSync(path.resolve(import.meta.dirname, "../../../DESIGN.md"), "utf8");

/** The `colors:` block of the front matter as name → value, with status rows flattened ("status-red.dot"). */
function designColours(): Map<string, string> {
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? "";
  const block = /^colors:\n((?: {2}.*\n)+)/m.exec(`${frontMatter}\n`)?.[1] ?? "";
  const colours = new Map<string, string>();
  for (const line of block.split("\n").filter((entry) => entry.trim() !== "")) {
    const [, name = "", rest = ""] = /^ {2}([a-z-]+): (.*)$/.exec(line) ?? [];
    const nested = [...rest.matchAll(/([a-z]+): "(#[0-9a-f]{6})"/g)];
    if (nested.length > 0) for (const [, key = "", value = ""] of nested) colours.set(`${name}.${key}`, value);
    else colours.set(name, /"(#[0-9a-f]{6})"/.exec(rest)?.[1] ?? "");
  }
  return colours;
}

const { colours } = brand;

/** Where each DESIGN.md colour lives in the brand package. */
const brandValueOf: Record<string, string> = {
  canvas: colours.canvas,
  surface: colours.surface,
  hairline: colours.hairline,
  "input-border": colours.inputBorder,
  ink: colours.ink,
  "ink-muted": colours.muted,
  action: colours.action,
  "action-hover": colours.actionPressed,
  "action-tint": colours.actionTint,
  people: colours.people,
  "people-pressed": colours.peoplePressed,
  "people-tint": colours.peopleTint,
  "people-tint-ink": colours.peopleTintInk,
  money: colours.money,
  "money-pressed": colours.moneyPressed,
  "money-tint": colours.moneyTint,
  ...Object.fromEntries(
    (
      [
        ["status-red", colours.status.bad],
        ["status-amber", colours.status.attention],
        ["status-green", colours.status.good],
        ["status-neutral", colours.status.neutral],
      ] as const
    ).flatMap(([name, status]) => [
      [`${name}.dot`, status.dot],
      [`${name}.bg`, status.fill],
      [`${name}.ink`, status.ink],
    ]),
  ),
};

describe("DESIGN.md and the brand package", () => {
  it("list the same palette", () => {
    const fromDesign = designColours();
    expect(fromDesign.size).toBeGreaterThan(20);
    expect(Object.fromEntries(fromDesign)).toEqual(brandValueOf);
  });
});
