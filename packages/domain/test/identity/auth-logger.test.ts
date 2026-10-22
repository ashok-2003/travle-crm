// Better Auth's log lines, as the structured log takes them: the level and the message with personal data masked, and
// the first Error among the arguments by name, code and frames, never its message. Nothing else Better Auth passes
// along (rows, requests, the error objects) goes out.
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { authLogger } from "../../src/identity/auth/auth-logger.js";

describe("Better Auth's logger", () => {
  it("writes a known message as it is, with an error's name, code and frames only", () => {
    const logger = createMemoryLogger();
    const { log } = authLogger(logger);
    const failure = Object.assign(new Error("duplicate key for jane.doe@example.com", { cause: new Error("Jane") }), {
      code: "P2002",
      meta: { target: ["email"], value: "jane.doe@example.com" },
    });
    log("error", "Failed to create user", failure, { email: "jane.doe@example.com" });
    log("warn", "Reset Password: User not found");
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0]).toMatchObject({
      level: "error",
      source: "better-auth",
      msg: "auth: Failed to create user",
      errorName: "Error",
      errorCode: "P2002",
      errorCause: "Error",
    });
    expect(logger.entries[0]?.errorStack).toMatch(/^\s*at /);
    expect(logger.entries[1]).toMatchObject({ level: "warn", msg: "auth: Reset Password: User not found" });
    expect(JSON.stringify(logger.entries)).not.toMatch(/jane|duplicate key/);
  });

  it("cuts a URL in a message back to its origin: no path, query or fragment", () => {
    const logger = createMemoryLogger();
    const { log } = authLogger(logger);
    log("error", "Invalid redirectURL: https://phishing.example/reset-password/TOKEN123?to=jane.doe@example.com#frag");
    log("error", "Invalid origin: https://evil.example");
    expect(logger.entries.map((entry) => entry.msg)).toEqual([
      "auth: Invalid redirectURL: https://phishing.example",
      "auth: Invalid origin: https://evil.example",
    ]);
  });

  it("withholds any other message, which could quote data, and says only that, with the error's fields", () => {
    const logger = createMemoryLogger();
    const { log } = authLogger(logger);
    log("error", "Failed to create user jane.doe@example.com, call 9876543210", new TypeError("x"));
    log("warn", `Provider "jane" failed: token abc123`);
    log("error", "Discovery fetch failed for x: Error: no row for Jane Doe");
    expect(logger.entries).toHaveLength(3);
    for (const entry of logger.entries) {
      expect(entry).toMatchObject({ msg: "auth message withheld", messageWithheld: true, source: "better-auth" });
    }
    expect(logger.entries[0]).toMatchObject({ level: "error", errorName: "TypeError" });
    expect(JSON.stringify(logger.entries)).not.toMatch(/jane|Jane|9876543210|abc123/);
  });

  it("without a logger, writes to the console at the line's level, withheld the same way", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      error.mockRestore();
      warn.mockRestore();
    });
    const { log } = authLogger();
    log("error", "Invalid redirectURL: https://phishing.example/?to=jane.doe@example.com", new TypeError("x"));
    log("warn", "Invalid password");
    log("warn", "User jane.doe@example.com not found");
    expect(error.mock.calls).toEqual([["auth error: Invalid redirectURL: https://phishing.example (TypeError)"]]);
    expect(warn.mock.calls).toEqual([["auth warn: Invalid password"], ["auth warn: auth message withheld"]]);
  });
});
