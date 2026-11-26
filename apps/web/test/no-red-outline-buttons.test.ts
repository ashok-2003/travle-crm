// The owner's rule (2026-11-21): a button that ends, removes or refuses something (Delete, Remove, Stop, Mark lost, Not a
// lead, cancelling a thing, a confirm dialog's last step) is a soft red fill with ink words: the registry Button's
// destructive variant, so every use follows it. Red words on an outline (the variant's old look) don't come back: the
// variants themselves are held here; no Button outside src/components/ui is coloured red by a class of its own; and a
// button whose words end something (read from the messages its file names) is the destructive one, but for the few
// listed below, each with why.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { messages } from "@/i18n/messages";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");
const skipped = ["components/ui", "generated"].map((folder) => path.join(sourceDirectory, folder));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return skipped.includes(full) ? [] : sourceFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** Each opening tag of these components in a source, its attributes whole (arrows and all), and where it ends. */
function openingTags(source: string, names: string[]): { tag: string; end: number }[] {
  const found: { tag: string; end: number }[] = [];
  for (const start of source.matchAll(new RegExp(`<(?:${names.join("|")})\\b`, "g"))) {
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
    found.push({ tag: source.slice(start.index, end + 1), end: end + 1 });
  }
  return found;
}

const buttonTags = (source: string) => openingTags(source, ["Button", "AlertDialogAction"]).map(({ tag }) => tag);

/** A class that colours something red: the destructive or status-bad tokens, under any variant. */
const redClass = /(?:^|[\s"'`])(?:[\w-]+:)*(?:text|bg|border)-(?:destructive|status-bad)[\w/-]*/;

/** The words a message key names in the app's messages, or null. */
function messageAt(key: string): string | null {
  const found = key.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null) return undefined;
    return (node as Record<string, unknown>)[part];
  }, messages);
  return typeof found === "string" ? found : null;
}

/** Words that end, remove or refuse something. A dialog's bare "Cancel" (its way out) is not one. */
const endingWords = /^(?:cancel |delete|remove|revoke|reject|discard|stop|turn off|disconnect|erase|block)/i;

interface Ending {
  file: string;
  words: string;
  destructive: boolean;
}

/** The buttons in a file whose words end something: a Button's children, or a FormDialog's trigger. */
function endings(file: string, source: string): Ending[] {
  const translators = new Map(
    [...source.matchAll(/const (\w+) = useTranslations\("([\w.-]*)"\)/g)].map((found) => [found[1], found[2]]),
  );
  const wordsIn = (code: string) =>
    [...code.matchAll(/\b(\w+)\(\s*"([\w.-]+)"/g)].flatMap(([, name = "", key = ""]) => {
      const namespace = translators.get(name);
      const words = namespace === undefined ? null : messageAt(namespace === "" ? key : `${namespace}.${key}`);
      return words === null ? [] : [words];
    });
  const isDestructive = (code: string) =>
    /variant=(?:"destructive"|\{[^}]*"destructive")|variant: "destructive"/.test(code);
  const fromButtons = openingTags(source, ["Button"]).flatMap(({ tag, end }) => {
    // Icon-only buttons (a trash can, an ✕ in a row) stay ghosts: their dialog's last step is the soft red one.
    if (tag.endsWith("/>") || tag.includes('size="icon')) return [];
    const body = source.slice(end, source.indexOf("</Button>", end));
    return wordsIn(body)
      .filter((words) => endingWords.test(words))
      .map((words) => ({ file, words, destructive: isDestructive(tag) }));
  });
  const fromTriggers = [...source.matchAll(/trigger=\{\{([^}]*)\}\}/g)].flatMap(([, trigger = ""]) =>
    wordsIn(trigger)
      .filter((words) => endingWords.test(words))
      .map((words) => ({ file, words, destructive: isDestructive(trigger) })),
  );
  return [...fromButtons, ...fromTriggers];
}

/** Buttons whose words end something but which stay as they are, and why (by file and words). */
const allowed: Record<string, string> = {
  "branding/logo-panel.tsx · Stop": "stops an upload still under way: nothing saved ends",
  "files/upload-control.tsx · Stop": "stops an upload still under way: nothing saved ends",
  "imports/import-file-step.tsx · Stop": "stops a file's upload still under way: nothing saved ends",
  "ai/fill/fill-source-fields.tsx · Stop ({time})": "stops the microphone's recording: nothing saved ends",
  "ai/fill/fill-source-fields.tsx · Remove": "takes a file off the form before it is sent: nothing saved ends",
  "shell/stop-impersonating.tsx · Stop": "support's way out of a member's session: nothing of the agency's ends",
  "shell/stop-impersonating.tsx · Stopping": "the same button while it leaves the session",
};

describe("destructive buttons", () => {
  // Owner, 2026-11-26: the soft red was too faint; the fill is the status-bad tint deepened with its dot (ink words 11:1).
  it("are a clear red fill with ink words, deeper on hover, without an outline", () => {
    const classes = buttonVariants({ variant: "destructive" }).split(/\s+/);
    expect(classes).toContain("text-foreground");
    expect(classes.some((name) => name.startsWith("bg-") && name.includes("status-bad-dot)_22%"))).toBe(true);
    expect(classes.some((name) => name.startsWith("hover:bg-") && name.includes("status-bad-dot)_32%"))).toBe(true);
    expect(classes).not.toContain("bg-background");
  });

  it("have no variant that colours an edge or words red", () => {
    const variants = [
      "default",
      "outline",
      "secondary",
      "ghost",
      "ai",
      "send",
      "quiet",
      "destructive",
      "link",
    ] as const;
    const classesOf = (variant: (typeof variants)[number]) => buttonVariants({ variant }).split(/\s+/);
    const shared = classesOf("default").filter((name) =>
      variants.every((variant) => classesOf(variant).includes(name)),
    );
    const red = variants.flatMap((variant) =>
      classesOf(variant)
        .filter((name) => !shared.includes(name))
        .filter((name) => /^(?:[\w-]+:)*(?:border|text)-(?:destructive|status-bad)/.test(name))
        .map((name) => `${variant}: ${name}`),
    );
    expect(red).toEqual([]);
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

  it("find a button's ending words by its file's messages, in a Button or a FormDialog's trigger", () => {
    const source = `const t = useTranslations("bookings.cancel");
      <Button variant="link" onClick={() => { go(); }}>{t("submit")}</Button>
      <Button variant="ghost" size="icon" aria-label={t("open")}><XIcon /></Button>
      <FormDialog trigger={{ label: t("open"), variant: "outline" }} />`;
    expect(endings("x.tsx", source)).toEqual([
      { file: "x.tsx", words: messages.bookings.cancel.submit, destructive: false },
      { file: "x.tsx", words: messages.bookings.cancel.open, destructive: false },
    ]);
  });

  it("are the destructive variant whenever their words end something, but for the listed few", () => {
    const found = sourceFiles(sourceDirectory).flatMap((file) =>
      endings(path.relative(sourceDirectory, file), readFileSync(file, "utf8")),
    );
    const notRed = found
      .filter((ending) => !ending.destructive)
      .map((ending) => `${ending.file} · ${ending.words}`)
      .filter((ending) => !(ending in allowed));
    expect(notRed).toEqual([]);
    // Every allowed one is still there to allow.
    const left = new Set(found.map((ending) => `${ending.file} · ${ending.words}`));
    for (const ending of Object.keys(allowed)) expect(left, ending).toContain(ending);
  });
});
