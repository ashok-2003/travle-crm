// Better Auth's log lines, as the structured log takes them: the level and the message with personal data masked, and
// the first Error among the arguments by name, code and frames, never its message. Nothing else Better Auth passes
// along (rows, requests, the error objects) goes out.
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { authLogger } from "../../src/identity/auth/auth-logger.js";

describe("Better Auth's logger", () => {
  it("writes the level and the masked message, and an error's name, code and frames only", () => {
    const logger = createMemoryLogger();
    const { log } = authLogger(logger);
    const failure = Object.assign(new Error("duplicate key for jane.doe@example.com", { cause: new Error("Jane") }), {
      code: "P2002",
      meta: { target: ["email"], value: "jane.doe@example.com" },
    });
    log("error", "Failed to create user jane.doe@example.com, call 9876543210", failure, {
      email: "jane.doe@example.com",
    });
    log("warn", "Reset Password: User not found");
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0]).toMatchObject({
      level: "error",
      source: "better-auth",
      msg: "auth: Failed to create user [email], call [number]",
      errorName: "Error",
      errorCode: "P2002",
      errorCause: "Error",
    });
    expect(logger.entries[0]?.errorStack).toMatch(/^\s*at /);
    expect(logger.entries[1]).toMatchObject({ level: "warn", msg: "auth: Reset Password: User not found" });
    expect(JSON.stringify(logger.entries)).not.toMatch(/jane|9876543210|duplicate key/);
  });

  it("keeps a long message to one short line", () => {
    const logger = createMemoryLogger();
    authLogger(logger).log("error", `Invalid redirectURL: https://x.example/${"a".repeat(500)}`);
    expect(logger.entries[0]?.msg.length).toBeLessThanOrEqual(206);
  });

  it("without a logger, writes to the console at the line's level", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      error.mockRestore();
      warn.mockRestore();
    });
    const { log } = authLogger();
    log("error", "Invalid redirectURL: https://phishing.example/?to=jane.doe@example.com", new TypeError("x"));
    log("warn", "Invalid password");
    expect(error.mock.calls).toEqual([
      ["auth error: Invalid redirectURL: https://phishing.example/?to=[email] (TypeError)"],
    ]);
    expect(warn.mock.calls).toEqual([["auth warn: Invalid password"]]);
  });
});
