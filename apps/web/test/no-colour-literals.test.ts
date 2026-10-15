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

/** Hex codes, colour functions, and Tailwind's own palette (switched off, but a class would silently do nothing). */
const colourLiteral =
  /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(bg|text|border|ring|fill|stroke|outline|from|to|via|shadow|divide|accent|caret|decoration)-(black|white|(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/i;

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
});
