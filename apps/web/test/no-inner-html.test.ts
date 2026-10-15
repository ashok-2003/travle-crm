// The Content-Security-Policy allows inline scripts (security-headers.ts; ADR 0018 records why), so the only guard
// against injected script is that the app never renders HTML from a string: React escapes everything else. This
// tripwire fails if any of the ways to do that appears in the app's source, generated files included.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

/** React's escape hatch, and the DOM's own ways to parse a string as HTML. */
const htmlFromString = /dangerouslySetInnerHTML|\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write/;

describe("HTML from strings", () => {
  it("appears nowhere in the app's source", () => {
    const files = sourceFiles(sourceDirectory);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => `${path.relative(sourceDirectory, file)}:${String(index + 1)}: ${line.trim()}`)
        .filter((line) => htmlFromString.test(line)),
    );
    expect(offenders).toEqual([]);
  });
});
