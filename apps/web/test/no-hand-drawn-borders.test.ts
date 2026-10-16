// The owner's rule: the registry's components already draw their borders, rings and shadows, so nothing outside
// src/components/ui adds its own. Content is grouped with the registry's Card, Item, Table and Separator instead.
// This keeps hand-drawn bordered lists from coming back; the few exceptions say why.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

/** The files that may draw an edge of their own, and why. None does now: even the phone's bottom bar has a Separator. */
const allowed: Record<string, string> = {};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return ["generated", "ui"].includes(entry.name) ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** The Tailwind classes in a source's strings that draw a border, a divider, a ring or a shadow, under any variant. */
function drawnEdges(source: string): string[] {
  const strings = source.match(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  return strings.flatMap((string) =>
    string
      .slice(1, -1)
      .split(/\s+/)
      .filter((word) => /^(?:\S+:)?(?:border|divide|ring|shadow)(?:-\S+)?$/.test(word)),
  );
}

const read = (file: string) => readFileSync(path.join(sourceDirectory, file), "utf8");

describe("hand-drawn edges", () => {
  it("are found in class strings, whatever the variant or side, and not in other words", () => {
    expect(drawnEdges(`<ul className="divide-y rounded-lg border">`)).toEqual(["divide-y", "border"]);
    expect(drawnEdges('cn("border-t pt-6", `md:shadow-sm hover:ring-2`)')).toEqual([
      "border-t",
      "md:shadow-sm",
      "hover:ring-2",
    ]);
    expect(drawnEdges('const label = "a string about bordered, ringing and shadowy words";')).toEqual([]);
  });

  it("appear nowhere outside the registry's components, but in the allowed files", () => {
    const files = sourceFiles(sourceDirectory).map((file) => path.relative(sourceDirectory, file));
    const drawn = files
      .filter((file) => !(file in allowed))
      .map((file) => [file, drawnEdges(read(file))] as const)
      .filter(([, edges]) => edges.length > 0);
    expect(Object.fromEntries(drawn)).toEqual({});
  });

  it("allow only files that still need it", () => {
    for (const file of Object.keys(allowed)) expect(drawnEdges(read(file)), file).not.toEqual([]);
  });
});
