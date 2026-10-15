// What a log line says about an error: its name and code, and its causes', never a message (a message can quote an
// email address or a reset link).
import { describe, expect, it } from "vitest";
import { describeError } from "../../src/jobs/index.js";

describe("describeError", () => {
  it("gives the name, and the code when there is one", () => {
    expect(describeError(new TypeError("no mailbox for jane@example.com"))).toBe("TypeError");
    expect(describeError(Object.assign(new Error("for jane@example.com"), { code: "EENVELOPE" }))).toBe(
      "Error EENVELOPE",
    );
  });

  it("follows the cause chain three levels down", () => {
    const deepest = Object.assign(new Error("4"), { code: "LEVEL4" });
    const third = new RangeError("3 for jane@example.com", { cause: deepest });
    const second = Object.assign(new Error("2", { cause: third }), { code: "P2028" });
    const first = new Error("Relaying organization x failed", { cause: second });
    expect(describeError(first)).toBe("Error, caused by Error P2028, caused by RangeError");
  });

  it("stops on a cause that leads back to itself", () => {
    const looping = new Error("loop");
    looping.cause = looping;
    expect(describeError(looping)).toBe("Error, caused by Error, caused by Error");
  });

  it("describes what pg-boss emits and what isn't an Error", () => {
    // pg-boss spreads an error into a plain object: its own properties, message, stack and the queue.
    expect(describeError({ message: "jane@example.com", stack: "at x", code: "57P01", queue: "a.b" })).toBe(
      "Error 57P01",
    );
    expect(describeError("jane@example.com")).toBe("string");
    expect(describeError(undefined)).toBe("undefined");
    expect(describeError(null)).toBe("null");
  });

  it("leaves out a name or code that isn't a plain identifier, since it could hold anything", () => {
    const odd = Object.assign(new Error("x"), { name: "jane@example.com", code: "call 98765 43210" });
    expect(describeError(odd)).toBe("Error");
    expect(describeError(Object.assign(new Error("x"), { code: 404 }))).toBe("Error 404");
  });
});
