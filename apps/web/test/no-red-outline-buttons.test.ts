// The owner's rule (2026-11-21): a button that ends, removes or refuses something (Delete, Remove, Stop, Mark lost, Not a
// lead, cancelling a thing, a confirm dialog's last step) is a soft red fill with ink words: the registry Button's
// destructive variant, so every use follows it. Red words on an outline (the variant's old look) don't come back: the
// variant itself is held here, and no Button outside src/components/ui is coloured red by a class of its own.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return ["generated", "ui"].includes(entry.name) ? [] : sourceFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** Each `<Button …>` and `<AlertDialogAction …>` opening tag in a source, its attributes whole (arrows and all). */
function buttonTags(source: string): string[] {
  const tags: string[] = [];
  for (const start of source.matchAll(/<(?:Button|AlertDialogAction)\b/g)) {
    let depth = 0;
    let end = start.index;
    for (let at = start.index; at < source.length; at += 1) {
      const character = source[at];
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (character === ">" && depth === 0 && source[at - 1] !== "=") {
        end = at;
        break;
      }
    }
    tags.push(source.slice(start.index, end + 1));
  }
  return tags;
}

/** A class that colours something red: the destructive or status-bad tokens, under any variant. */
const redClass = /(?:^|[\s"'`])(?:[\w-]+:)*(?:text|bg|border)-(?:destructive|status-bad)[\w/-]*/;

describe("destructive buttons", () => {
  it("are the status-bad fill with ink words, a little deeper on hover, without an outline", () => {
    const classes = buttonVariants({ variant: "destructive" }).split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["bg-status-bad-fill", "text-foreground"]));
    expect(classes.some((name) => name.startsWith("hover:bg-") && name.includes("status-bad"))).toBe(true);
    expect(classes).not.toContain("text-destructive");
    expect(classes).not.toContain("border-foreground");
    expect(classes).not.toContain("bg-background");
  });

  it("find a red-coloured button's tag whole, past its arrow functions", () => {
    const source = `<Button variant="ghost" onClick={() => { go(); }} className="text-destructive">Delete</Button>`;
    expect(buttonTags(source)).toEqual([
      `<Button variant="ghost" onClick={() => { go(); }} className="text-destructive">`,
    ]);
    expect(redClass.test(buttonTags(source)[0] ?? "")).toBe(true);
    expect(redClass.test(`<Button variant="destructive">`)).toBe(false);
  });

  it("are never an outline or ghost button coloured red by a class outside the registry", () => {
    const red = sourceFiles(sourceDirectory)
      .map((file) => [path.relative(sourceDirectory, file), buttonTags(readFileSync(file, "utf8"))] as const)
      .map(([file, tags]) => [file, tags.filter((tag) => redClass.test(tag))] as const)
      .filter(([, tags]) => tags.length > 0);
    expect(Object.fromEntries(red)).toEqual({});
  });
});
