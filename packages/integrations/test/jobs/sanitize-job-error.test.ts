// What pg-boss stores about a failed job is shown to platform staff, so errors are cut down to a short message
// with emails and long numbers masked, and normalised when they aren't Errors.
import { describe, expect, it } from "vitest";
import { sanitizeJobError, toError } from "../../src/jobs/index.js";

describe("sanitizeJobError", () => {
  it("keeps the error's name and message, masks emails and runs of 7 or more digits", () => {
    const error = sanitizeJobError(new TypeError("send to a.b+c@mail.example.co failed, ref 1234567, code 123456"));
    expect(error.message).toBe("TypeError: send to [email] failed, ref [number], code 123456");
  });

  it("drops the cause, the stack's origin and extra properties", () => {
    const original = Object.assign(new Error("x", { cause: new Error("inner") }), { detail: "secret" });
    const error = sanitizeJobError(original);
    expect(error).not.toBe(original);
    expect(error.cause).toBeUndefined();
    expect(Object.keys(error)).toEqual([]);
    expect(error.stack).toBe("Error: x");
  });

  it("truncates to 200 characters", () => {
    expect(sanitizeJobError(new Error("a".repeat(500))).message).toHaveLength(200);
  });

  it("accepts things that aren't Errors", () => {
    expect(sanitizeJobError("plain string").message).toBe("Error: plain string");
    expect(sanitizeJobError({ message: "object with message" }).message).toBe("Error: object with message");
  });
});

describe("toError", () => {
  it("returns Errors as they are and wraps everything else", () => {
    const error = new Error("kept");
    expect(toError(error)).toBe(error);
    expect(toError({ message: "from object" }).message).toBe("from object");
    expect(toError(42).message).toBe("42");
  });
});
