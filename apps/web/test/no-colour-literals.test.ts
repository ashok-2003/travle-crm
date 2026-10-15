// Colours come from the brand package only (DESIGN.md: never a colour literal in components). The generated
// brand.css is the one place that holds values; every other stylesheet and component reads tokens.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const namedColours =
  "black|white|red|orange|yellow|green|teal|cyan|blue|indigo|violet|purple|pink|gray|grey|brown|navy|maroon|silver|gold";
const palette =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

/**
 * Hex codes, colour functions, Tailwind's own palette under any utility prefix (bg-red-500, border-t-red-500,
 * ring-offset-white, placeholder-gray-400: switched off, but a class would silently do nothing), arbitrary values
 * (bg-[red]), and named colours in inline styles (color: "red").
 */
export const colourLiteral = new RegExp(
  [
    String.raw`#[0-9a-f]{3,8}\b`,
    String.raw`\b(rgba?|hsla?|oklch|oklab|lab|lch)\(`,
    String.raw`\b[a-z]+(?:-[a-z]+)*-(black|white|(${palette})-\d{2,3})\b`,
    String.raw`-\[(${namedColours})\]`,
    String.raw`\b(color|background|backgroundColor|borderColor|fill|stroke|outlineColor)\s*:\s*["'](${namedColours})["']`,
  ].join("|"),
  "i",
);

describe("colour literals", () => {
  it("appear nowhere in the app's source but the generated brand stylesheet", () => {
    const files = sourceFiles(sourceDirectory);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ file: path.relative(sourceDirectory, file), line: index + 1, text: line.trim() }))
        .filter(({ text }) => colourLiteral.test(text)),
    );
    expect(offenders).toEqual([]);
  });

  it.each([
    "bg-red-500",
    "border-t-red-500",
    "ring-offset-white",
    "placeholder-gray-400",
    "bg-[red]",
    'color: "red"',
    "#fff",
    "rgb(0 0 0)",
  ])("catches %s", (sample) => {
    expect(colourLiteral.test(sample)).toBe(true);
  });

  it.each(["text-primary-foreground", "bg-status-good-fill", "border-input", "ring-ring/50", "bg-scrim"])(
    "lets the brand's tokens through: %s",
    (sample) => {
      expect(colourLiteral.test(sample)).toBe(false);
    },
  );
});
