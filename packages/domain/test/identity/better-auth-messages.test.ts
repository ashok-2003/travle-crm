// The messages Better Auth can log, as the checked-in allowlist holds them (ADR 0032): the list must be exactly what the
// installed Better Auth's code passes to its logger, so an upgrade that adds or rewords a message is seen, and reviewed,
// before its text reaches a log.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGE_PREFIXES, STATIC_MESSAGES } from "../../src/identity/auth/better-auth-messages.js";
import { extractBetterAuthMessages } from "./support/better-auth-messages.js";

const listFile = path.resolve(import.meta.dirname, "../../src/identity/auth/better-auth-messages.ts");

const quoted = (items: readonly string[]) => items.map((item) => `  ${JSON.stringify(item)},\n`).join("");

describe("Better Auth's message allowlist", () => {
  it("is what the installed Better Auth logs", () => {
    const found = extractBetterAuthMessages();
    if (process.env.UPDATE_AUTH_MESSAGES === "1") {
      writeFileSync(
        listFile,
        `// GENERATED from the installed better-auth's code by test/identity/better-auth-messages.test.ts (run it with\n// UPDATE_AUTH_MESSAGES=1 after a Better Auth upgrade). The sentences Better Auth logs whole, and the starts of those it\n// logs with a value after them; auth-logger.ts writes only these.\n\n/** Logged whole. */\nexport const STATIC_MESSAGES: readonly string[] = [\n${quoted(found.statics)}];\n\n/** The start of a message that goes on with a value (an id, a URL, a name): only this start is written. */\nexport const MESSAGE_PREFIXES: readonly string[] = [\n${quoted(found.prefixes)}];\n`,
      );
      return;
    }
    expect([...STATIC_MESSAGES]).toEqual(found.statics);
    expect([...MESSAGE_PREFIXES]).toEqual(found.prefixes);
  });

  it("holds the sentences the product depends on", () => {
    expect(STATIC_MESSAGES).toEqual(
      expect.arrayContaining(["User not found", "Invalid password", "Failed to create user"]),
    );
  });
});
