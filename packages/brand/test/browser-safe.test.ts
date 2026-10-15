// The package's main entry is plain data, so the web app can import it in the browser: nothing it loads may import
// a Node module or read import.meta (bundlers give browser code neither). File paths live at @travel-crm/brand/files.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

/** The relative files a source file imports, followed recursively, as paths under src/. */
function loadedFiles(file: string, seen = new Set<string>()): Set<string> {
  seen.add(file);
  const text = readFileSync(path.join(sourceDirectory, file), "utf8");
  for (const [, specifier = ""] of text.matchAll(/from "(\.\/[^"]+)\.js"/g)) {
    const next = `${specifier.slice(2)}.ts`;
    if (!seen.has(next)) loadedFiles(next, seen);
  }
  return seen;
}

describe("the main entry", () => {
  it("loads no Node module and no import.meta", () => {
    const files = [...loadedFiles("index.ts")];
    expect(files).toEqual(expect.arrayContaining(["index.ts", "brand.ts", "icons.ts"]));
    for (const file of files) {
      const text = readFileSync(path.join(sourceDirectory, file), "utf8");
      expect(text, file).not.toMatch(/from "node:|import\.meta/);
    }
  });
});
