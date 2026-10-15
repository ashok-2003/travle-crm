// @vitest-environment node
// Every reason a refusal can carry has its sentence (spec 9.7: the web app shows the reason's own message), and every
// sentence belongs to a reason something still throws. The reasons are read from the api's sources: the second
// argument of every `new DomainError(...)` in packages/domain, packages/api and apps/api, and, where that argument is
// a parameter of a helper (`notFound(reason, ...)`, `parseInput(..., reason)`), what every call of the helper passes.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import errors from "@/i18n/messages/en-IN/errors.json";

const repository = path.resolve(import.meta.dirname, "../../../..");
const SOURCES = ["packages/domain/src", "packages/api/src", "apps/api/src"];

/** Reasons no screen can meet: the console commands' own (`console-command.ts`) and notify()'s, which only modules call. */
const NEVER_SHOWN = ["DEMO_CODE_TAKEN", "DEMO_PLAN_KEY_TAKEN", "SUPER_ADMIN_EXISTS", "INVALID_NOTIFICATION"];

const REASON = /"([A-Z][A-Z0-9_]*)"/g;

function sourceFiles(): string[] {
  return SOURCES.flatMap((folder) =>
    readdirSync(path.join(repository, folder), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => readFileSync(path.join(repository, folder, file), "utf8")),
  );
}

/** The top-level arguments of the call whose opening parenthesis is at `open`, as source text. */
function argumentsAt(text: string, open: number): string[] {
  const found: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let index = open; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      current += character;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    if ("([{".includes(character)) depth += 1;
    if (")]}".includes(character)) depth -= 1;
    if (depth === 0) return [...found, current];
    if (character === "," && depth === 1) {
      found.push(current);
      current = "";
    } else if (index > open) {
      current += character;
    }
  }
  return found;
}

/** Every call of `callee` in the text: its arguments. */
function callsOf(text: string, callee: string): string[][] {
  const pattern = new RegExp(`(?<![\\w.])${callee.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:<[^>()]*>)?\\(`, "g");
  return [...text.matchAll(pattern)].map((match) => argumentsAt(text, match.index + match[0].length - 1));
}

/** The helper a DomainError's reason parameter comes from: the nearest function before `at` that takes `parameter`. */
function helperTaking(text: string, at: number, parameter: string): { name: string; position: number } | null {
  const before = text.slice(0, at);
  const helpers = [...before.matchAll(/(?:function\s+(\w+)\s*(?:<[^>()]*>)?|const\s+(\w+)\s*=\s*)\(/g)];
  const nearest = helpers.at(-1);
  if (!nearest) return null;
  const name = nearest[1] ?? nearest[2] ?? "";
  const parameters = argumentsAt(text, nearest.index + nearest[0].length - 1).map((part) =>
    (part.split(":")[0] ?? "").trim(),
  );
  const position = parameters.indexOf(parameter);
  return position === -1 ? null : { name, position };
}

function thrownReasons(): Set<string> {
  const files = sourceFiles();
  const reasons = new Set<string>();
  const literalsIn = (text: string) => [...text.matchAll(REASON)].map(([, reason]) => reason ?? "");
  for (const text of files) {
    for (const match of text.matchAll(/new DomainError\(/g)) {
      const at = match.index + match[0].length - 1;
      const reason = (argumentsAt(text, at)[1] ?? "").trim();
      const literals = literalsIn(reason);
      const helper = literals.length === 0 ? helperTaking(text, match.index, reason) : null;
      if (helper) {
        const passed = files.flatMap((file) => callsOf(file, helper.name).map((call) => call[helper.position] ?? ""));
        for (const argument of passed) literals.push(...literalsIn(argument));
      } else if (literals.length === 0) {
        // A local such as `step`, compared on the same line: `if (step === "CHANGE_PASSWORD") throw ...`.
        const line = text.slice(text.lastIndexOf("\n", match.index) + 1, text.indexOf("\n", match.index));
        literals.push(...literalsIn(line).slice(0, 1));
      }
      expect(literals.length, `a DomainError with an unreadable reason: ${reason}`).toBeGreaterThan(0);
      for (const literal of literals) reasons.add(literal);
    }
  }
  return reasons;
}

describe("errors.json's reasons", () => {
  const thrown = thrownReasons();
  const sentences = Object.keys(errors.reasons);

  it("give every reason the api can refuse with a sentence", () => {
    const missing = [...thrown].filter((reason) => !sentences.includes(reason) && !NEVER_SHOWN.includes(reason));
    expect(missing.sort()).toEqual([]);
  });

  it("hold no sentence for a reason nothing throws, nor for one no screen can meet", () => {
    expect(sentences.filter((reason) => !thrown.has(reason) || NEVER_SHOWN.includes(reason)).sort()).toEqual([]);
  });

  it("find the reasons wherever they are written: literally, through a helper, or by a local", () => {
    for (const reason of ["LAST_OWNER", "LINK_REVOKED", "INVALID_PREFERENCE", "SET_UP_TWO_FACTOR", "NOT_SOLD_YEARLY"]) {
      expect(thrown, reason).toContain(reason);
    }
  });
});
