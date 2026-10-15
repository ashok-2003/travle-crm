// Better Auth's log lines, as our one log takes them: the level and the message with personal data masked, and an
// Error among the arguments by name and code only. Nothing else Better Auth passes along (rows, requests, the error
// objects) goes out.
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { authLogger } from "../../src/identity/auth/auth-logger.js";

describe("Better Auth's logger", () => {
  it("writes the level and the masked message, and an error's names and codes only", () => {
    const lines: string[] = [];
    const { log } = authLogger((line) => lines.push(line));
    const failure = Object.assign(new Error("duplicate key for jane.doe@example.com", { cause: new Error("Jane") }), {
      code: "P2002",
      meta: { target: ["email"], value: "jane.doe@example.com" },
    });
    log("error", "Failed to create user jane.doe@example.com, call 9876543210", failure, {
      email: "jane.doe@example.com",
    });
    log("warn", "Reset Password: User not found");
    expect(lines).toEqual([
      "auth error: Failed to create user [email], call [number] (Error P2002, caused by Error)",
      "auth warn: Reset Password: User not found",
    ]);
  });

  it("keeps a long message to one short line", () => {
    const lines: string[] = [];
    authLogger((line) => lines.push(line)).log("error", `Invalid redirectURL: https://x.example/${"a".repeat(500)}`);
    expect(lines[0]?.length).toBeLessThanOrEqual(240);
  });

  it("without a log, writes to the console at the line's level", () => {
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
