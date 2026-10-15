// DESIGN.md's shapes (radii, type scale, z scale, overlay shadow) are written once in its front matter and prose and
// once in globals.css. design-tokens.test.ts ties the colours; this ties the rest, and checks the shadcn components
// don't reach past them (numeric z-index, rings for focus, clipped names, the small button sizes).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const designMd = readFileSync(path.resolve(webRoot, "../../DESIGN.md"), "utf8");
const css = readFileSync(path.join(webRoot, "src/app/globals.css"), "utf8");
const frontMatter = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? "";
const uiDirectory = path.join(webRoot, "src/components/ui");
const uiFiles = readdirSync(uiDirectory).filter((name) => name.endsWith(".tsx"));
const ui = (name: string) => readFileSync(path.join(uiDirectory, name), "utf8");

/** A px or rem length from CSS as pixels. */
function toPixels(length: string): number {
  const rem = /^([\d.]+)rem$/.exec(length);
  return rem ? Number(rem[1]) * 16 : Number.parseFloat(length);
}

/** Every match of a two-group pattern as name → value. */
function pairs(text: string, pattern: RegExp): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name = "", value = ""] of text.matchAll(pattern)) found[name] = value;
  return found;
}

function cssValue(name: string): string {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? "";
}

describe("radii", () => {
  const designRadii = pairs(/^radii: \{(.*)\}$/m.exec(frontMatter)?.[1] ?? "", /([a-z]+): (\d+)px/g);

  it("come out of the stylesheet as DESIGN.md says: input 6, card 10, dialog 14, badge 4", () => {
    const base = toPixels(cssValue("--radius"));
    expect({
      badge: toPixels(cssValue("--radius-badge")),
      input: base * Number(/--radius-sm: calc\(var\(--radius\) \* ([\d.]+)\)/.exec(css)?.[1]),
      card: base,
      dialog: base * Number(/--radius-xl: calc\(var\(--radius\) \* ([\d.]+)\)/.exec(css)?.[1]),
    }).toEqual({
      badge: Number(designRadii.badge),
      input: Number(designRadii.input),
      card: Number(designRadii.card),
      dialog: Number(designRadii.dialog),
    });
  });

  it("are used as designed: cards 10px (rounded-lg), dialogs 14px (rounded-xl), inputs 6px (rounded-sm)", () => {
    expect(ui("card.tsx")).toContain("rounded-lg");
    expect(ui("card.tsx")).not.toContain("rounded-xl");
    expect(ui("dialog.tsx")).toContain("rounded-xl");
    expect(ui("input.tsx")).toContain("rounded-sm");
    expect(ui("input-group.tsx")).toMatch(/data-slot="input-group"[\s\S]*?rounded-sm/);
    expect(ui("textarea.tsx")).toContain("rounded-sm");
    expect(ui("select.tsx")).toMatch(/SelectPrimitive\.Trigger[\s\S]*rounded-sm/);
  });
});

describe("type scale", () => {
  const names: Record<string, string> = {
    "page-title": "title",
    "section-title": "section",
    body: "body",
    label: "label",
    caption: "caption",
    number: "number",
    "number-lg": "number-lg",
  };

  it.each(Object.entries(names))("%s is the stylesheet's text-%s", (design, token) => {
    const row = new RegExp(
      `^ {2}${design}:\\s*\\{?[^\\n]*?size: (\\d+)px, weight: \\d+, lineHeight: (\\d+)px`,
      "ms",
    ).exec(frontMatter.replace(/\n {4,}/g, " "));
    expect(row, design).not.toBeNull();
    expect([toPixels(cssValue(`--text-${token}`)), toPixels(cssValue(`--text-${token}--line-height`))]).toEqual([
      Number(row?.[1]),
      Number(row?.[2]),
    ]);
  });
});

describe("z scale", () => {
  it("is DESIGN.md's: sticky 10, dropdown 20, overlay 30, dialog 40, toast 50, tooltip 60", () => {
    const written = /Semantic z-index scale: base 0, (.*)\./.exec(designMd)?.[1] ?? "";
    const scale = pairs(written, /([a-z]+) (\d+)/g);
    const stylesheet = pairs(css, /--z-([a-z]+): (\d+);/g);
    expect(Object.keys(scale)).toHaveLength(6);
    expect(stylesheet).toEqual(scale);
  });
});

describe("overlay shadow", () => {
  it("is DESIGN.md's two layers, drawn in ink", () => {
    expect(designMd).toContain("0 8px 24px rgba(26,26,26,0.10), 0 1px 2px rgba(26,26,26,0.06)");
    const shadow = /--overlay-shadow:([^;]+);/.exec(css)?.[1] ?? "";
    const layers = [...shadow.matchAll(/(0 \d+px \d+px) color-mix\(in srgb, var\(--brand-ink\) (\d+)%/g)].map((m) =>
      m.slice(1),
    );
    expect(layers).toEqual([
      ["0 8px 24px", "10"],
      ["0 1px 2px", "6"],
    ]);
  });
});

describe("the shadcn components", () => {
  it.each(uiFiles)("%s uses the semantic z scale and the single focus outline, and wraps names", (name) => {
    const source = ui(name);
    expect(source, "numeric z-index").not.toMatch(/\bz-\d+\b/);
    expect(source, "a focus ring on top of the global outline").not.toMatch(/focus-visible:(ring|outline)-/);
    expect(source, "a ring in place of the hairline border").not.toContain("ring-foreground/10");
    if (["select.tsx", "table.tsx", "sidebar.tsx", "item.tsx"].includes(name)) {
      expect(source, "clipped names").not.toMatch(/line-clamp|whitespace-nowrap|truncate/);
    }
  });

  it("button has no size under the 36px dense one", () => {
    const source = ui("button.tsx");
    for (const dropped of ["xs:", "icon-xs", "icon-sm"]) expect(source).not.toContain(dropped);
  });

  it("table headers are shadcn's own, with no fill on top", () => {
    const header = /function TableHeader[\s\S]*?cn\("([^"]*)"/.exec(ui("table.tsx"))?.[1];
    expect(header).toBe("[&_tr]:border-b");
  });
});
