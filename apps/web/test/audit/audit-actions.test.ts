// @vitest-environment node
// Every action an organization's audit log can hold has its sentence on the audit log screen, and every sentence
// belongs to an action something still records. The actions are read from the sources: the `action` of every
// `recordAudit(...)` call in packages/domain, packages/api and apps/api, written literally, or, where the call passes
// a parameter (`{ action, ... }`), the literals the parameter's type allows (`action: "a" | "b"`).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isKnownAction } from "@/audit/audit-words";
import audit from "@/i18n/messages/en-IN/audit.json";

const repository = path.resolve(import.meta.dirname, "../../../..");
const SOURCES = ["packages/domain/src", "packages/api/src", "apps/api/src"];

const LITERAL_ACTION = /\baction:\s*"([a-z][a-z0-9.-]*)"/;
const ACTION_TYPE = /\baction:\s*("[a-z][a-z0-9.-]*"(?:\s*\|\s*"[a-z][a-z0-9.-]*")+)/g;

function sourceFiles(): string[] {
  return SOURCES.flatMap((folder) =>
    readdirSync(path.join(repository, folder), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => readFileSync(path.join(repository, folder, file), "utf8")),
  );
}

/** The text of the call whose opening parenthesis is at `open`, up to its closing one. */
function callAt(text: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") quote = character;
    else if ("([{".includes(character)) depth += 1;
    else if (")]}".includes(character)) depth -= 1;
    if (depth === 0) return text.slice(open, index + 1);
  }
  return text.slice(open);
}

function recordedActions(): Set<string> {
  const actions = new Set<string>();
  for (const text of sourceFiles()) {
    // Calls only: not the function's own declaration.
    for (const match of text.matchAll(/(?<![\w.]|function )recordAudit\s*\(/g)) {
      const call = callAt(text, match.index + match[0].length - 1);
      const literal = LITERAL_ACTION.exec(call)?.[1];
      const typed = literal
        ? []
        : [...text.matchAll(ACTION_TYPE)].flatMap(([, union]) => [...(union ?? "").matchAll(/"([^"]+)"/g)]);
      const found = literal ? [literal] : typed.map(([, action]) => action ?? "");
      expect(found.length, `a recordAudit call with an unreadable action: ${call.slice(0, 120)}`).toBeGreaterThan(0);
      for (const action of found) actions.add(action);
    }
  }
  return actions;
}

/** Every sentence in audit.json, as the action it is for ("staff.removed"). */
function sentences(): string[] {
  return Object.entries(audit.actions).flatMap(([entity, happened]) =>
    Object.keys(happened).map((what) => `${entity}.${what}`),
  );
}

describe("audit.json's actions", () => {
  const recorded = recordedActions();

  it("give every action an organization's log can hold a sentence", () => {
    expect([...recorded].filter((action) => !isKnownAction(action)).sort()).toEqual([]);
  });

  it("hold no sentence for an action nothing records", () => {
    expect(sentences().filter((action) => !recorded.has(action))).toEqual([]);
  });

  it("find the actions wherever they are written: literally, or through a parameter's type", () => {
    for (const action of ["staff.removed", "role.updated", "subscription.payment-recorded", "document.issued"]) {
      expect(recorded, action).toContain(action);
    }
    expect(recorded).toContain("support.impersonation-started");
  });
});
