// @vitest-environment node
// Class merging (lib/utils.ts's cn) knows the theme's own type sizes (globals.css's --text-* tokens: text-caption,
// text-label...): one of them replaces another size and keeps the colour beside it, where the package's own cn would
// read it as a colour and drop the component's. Every file merges through lib/utils.ts, never the package directly.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const source = path.resolve(import.meta.dirname, "../../src");

/** The theme's font-size names: each --text-<name> in globals.css, its line heights aside. */
function themeTypeSizes(): string[] {
  const css = readFileSync(path.join(source, "app/globals.css"), "utf8");
  return [...css.matchAll(/--text-([a-z-]+?):/g)]
    .map((match) => match[1] ?? "")
    .filter((name) => name !== "" && !name.endsWith("-line-height"));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("cn", () => {
  it("finds the theme's type sizes to check", () => {
    expect(themeTypeSizes()).toEqual(expect.arrayContaining(["caption", "label", "section", "body", "number-lg"]));
  });

  it("reads each of the theme's type sizes as a size: it replaces another and keeps the colour", () => {
    for (const size of themeTypeSizes()) {
      expect(cn("text-primary text-sm", `text-${size}`), size).toBe(`text-primary text-${size}`);
      expect(cn(`text-${size} text-muted-foreground`, "text-status-bad-ink"), size).toBe(
        `text-${size} text-status-bad-ink`,
      );
    }
  });

  it("still merges what the package knows: a later colour or size wins", () => {
    expect(cn("text-primary", "text-muted-foreground")).toBe("text-muted-foreground");
    expect(cn("text-sm", "text-base")).toBe("text-base");
    expect(cn("px-2", false, "px-4")).toBe("px-4");
  });

  it("is the one every file merges with: none imports the package's own", () => {
    const direct = sourceFiles(source)
      .filter((file) => /from "cn(\/[a-z]+)?"/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(source, file));
    expect(direct).toEqual(["lib/utils.ts"]);
  });
});
