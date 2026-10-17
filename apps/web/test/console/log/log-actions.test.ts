// The platform log's actions the console has a sentence for are exactly those the platform module records: a new
// `action: "…"` in packages/domain/src/platform without a sentence would show as a raw key, as five once did. Every
// record an erasure may act on is named by a word too: a customer's ("person") read "person" until release 1's review.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isNamedTarget, KNOWN_ACTIONS } from "@/console/log/log-actions";
import { messages } from "@/i18n/messages";

const platformSources = path.resolve(__dirname, "../../../../../packages/domain/src/platform");

/** Every action the module names: `action: "x.y"`, `failedAction: "x.y"` and a constant of the same shape. */
function recordedActions(): string[] {
  const found = new Set<string>();
  for (const file of readdirSync(platformSources).filter((name) => name.endsWith(".ts"))) {
    const source = readFileSync(path.join(platformSources, file), "utf8");
    for (const match of source.matchAll(/(?:\b(?:action|failedAction):|\bconst [A-Z_]+ =) "([a-z-]+\.[a-z-]+)"/g)) {
      if (match[1] !== undefined) found.add(match[1]);
    }
  }
  // Written to the member's organization's log, not the platform's.
  found.delete("support.impersonation-stopped");
  // The job queues' names share the constants' shape.
  for (const name of found) if (name.startsWith("platform.")) found.delete(name);
  return [...found].sort();
}

describe("the platform log's known actions", () => {
  it("are every action the platform module records, and no other", () => {
    expect([...KNOWN_ACTIONS].sort()).toEqual(recordedActions());
  });

  it("each have a sentence", () => {
    for (const action of KNOWN_ACTIONS) {
      const [group = "", name = ""] = action.split(".");
      const sentences = messages.consolePlatform.log.actions as Record<string, Record<string, string>>;
      expect(sentences[group]?.[name], action).toEqual(expect.any(String));
    }
  });
});

describe("the platform log's targets", () => {
  it("name every record an erasure may act on, a customer as Customer", () => {
    const source = readFileSync(path.join(platformSources, "deletion-checks.ts"), "utf8");
    const listed = /const PERSONAL_RECORD_TYPES[^=]*= \[([^\]]*)\]/.exec(source)?.[1] ?? "";
    const types = [...listed.matchAll(/"([a-z_]+)"/g)].map((match) => match[1] ?? "");
    expect(types).toContain("person");
    const targets: Record<string, string> = messages.consolePlatform.log.targets;
    for (const type of types) {
      expect(isNamedTarget(type), type).toBe(true);
      expect(targets[type], type).toEqual(expect.any(String));
    }
    expect(targets.person).toBe("Customer");
  });
});
