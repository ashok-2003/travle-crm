// The package's main entry is plain data, so the web app can import it in the browser: nothing it loads may import
// a Node module or read import.meta (bundlers give browser code neither). File paths live at @travel-crm/brand/files.
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

/** Every module specifier a source file loads: static, re-exported, side-effect and dynamic imports. */
function specifiers(text: string): string[] {
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map(([, specifier = ""]) => specifier);
}

/** Node's own modules, with or without the `node:` prefix: fs, path, process and the rest. */
const nodeModules = new Set(builtinModules.filter((name) => !name.startsWith("_")));

/** The relative files a source file imports (./x.js, ../x.js), followed recursively, as paths under src/. */
function loadedFiles(file: string, seen = new Set<string>()): Set<string> {
  seen.add(file);
  const text = readFileSync(path.join(sourceDirectory, file), "utf8");
  for (const specifier of specifiers(text).filter((entry) => entry.startsWith("."))) {
    const next = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.replace(/\.js$/, ".ts")));
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
      expect(text, file).not.toMatch(/import\.meta/);
      const node = specifiers(text).filter(
        (entry) => entry.startsWith("node:") || nodeModules.has(entry.split("/")[0] ?? ""),
      );
      expect(node, file).toEqual([]);
    }
  });

  it("sees the import forms the old pattern missed", () => {
    const text =
      'import "./a.js"; export * from "../b.js"; const c = await import("fs"); import { d } from "node:path";';
    expect(specifiers(text)).toEqual(["./a.js", "../b.js", "fs", "node:path"]);
  });
});
