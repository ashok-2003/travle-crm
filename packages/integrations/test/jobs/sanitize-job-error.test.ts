// What pg-boss stores about a failed job is shown to platform staff. An error whose message our code wrote keeps it,
// cut short with emails and long numbers masked (ids left whole); anyone else's error keeps only its names and codes.
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ownMessage, ownMessages, sanitizeJobError, toError } from "../../src/jobs/index.js";

/** A version 7 UUID (RFC 9562), as Postgres's uuidv7() makes them: the time in milliseconds, then random bits. */
function uuidV7(milliseconds: number): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(milliseconds, 0, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** An error message our code wrote, as the sanitiser sees it. */
const ours = (message: string) => sanitizeJobError(ownMessage(new Error(message))).message;

describe("sanitizeJobError", () => {
  it("keeps only the names and codes of an error our code didn't write, never its message", () => {
    const fromALibrary = Object.assign(new Error("no mailbox for Jane Doe <jane.doe@example.com>"), {
      code: "EENVELOPE",
      cause: new TypeError("rejected jane.doe@example.com"),
    });
    expect(sanitizeJobError(fromALibrary).message).toBe("Error EENVELOPE, caused by TypeError");
    expect(sanitizeJobError(new RangeError("Jane Doe")).message).toBe("RangeError");
    expect(sanitizeJobError(fromALibrary).stack).toBe("Error EENVELOPE, caused by TypeError");
  });

  it("keeps the name and message of an error our code wrote, masking emails and runs of 7 or more digits", () => {
    const error = sanitizeJobError(
      ownMessage(new TypeError("send to a.b+c@mail.example.co failed, ref 1234567, code 123456")),
    );
    expect(error.message).toBe("TypeError: send to [email] failed, ref [number], code 123456");
  });

  it("keeps the messages of every error of a class our code defines", () => {
    class QuoteRefused extends Error {
      static {
        ownMessages(this);
      }
    }
    const refused = Object.assign(new QuoteRefused("Quote for jane.doe@example.com refused"), { name: "QuoteRefused" });
    expect(sanitizeJobError(refused).message).toBe("QuoteRefused: Quote for [email] refused");
  });

  it("masks phone and Aadhaar style numbers written with spaces or hyphens", () => {
    for (const written of ["98765 43210", "+91-98765-43210", "1234 5678 9012"]) {
      expect(ours(`call ${written} now`)).toBe("Error: call [number] now");
    }
  });

  it("leaves ids whole: 1,000 generated version 4 and version 7 UUIDs, and one made only of digits", () => {
    const ids = [
      ...Array.from({ length: 500 }, () => randomUUID()),
      ...Array.from({ length: 500 }, (_, index) => uuidV7(Date.now() + index * 997)),
      "12345678-1234-4123-8123-123456789012",
      "87654321-4321-7321-9321-210987654321",
    ];
    for (let index = 0; index < ids.length; index += 2) {
      const message = `listener: event ${ids[index] ?? ""} not found in organization ${ids[index + 1] ?? ""}`;
      expect(ours(message)).toBe(`Error: ${message}`);
    }
  });

  it("masks a number standing alone in free text, but not digits inside a word, a code or an id", () => {
    const cases: [string, string][] = [
      ["call 9876543210", "call [number]"],
      ["call +91 98765 43210 today", "call [number] today"],
      ["Aadhaar 1234-5678-9012.", "Aadhaar [number]."],
      ["tel:9876543210", "tel:[number]"],
      ["job 0199e7a0-0000-7000-8000-0000000000b1 failed", "job 0199e7a0-0000-7000-8000-0000000000b1 failed"],
      ["build ab1234567cd and v-1234567", "build ab1234567cd and v-1234567"],
    ];
    for (const [written, masked] of cases) {
      expect(ours(written)).toBe(`Error: ${masked}`);
    }
  });

  it("drops the cause, the stack's origin and extra properties", () => {
    const original = Object.assign(ownMessage(new Error("x", { cause: new Error("inner") })), { detail: "secret" });
    const error = sanitizeJobError(original);
    expect(error).not.toBe(original);
    expect(error.cause).toBeUndefined();
    expect(Object.keys(error)).toEqual([]);
    expect(error.stack).toBe("Error: x");
  });

  it("truncates to 200 characters", () => {
    expect(ours("a".repeat(500))).toHaveLength(200);
  });

  it("accepts things that aren't Errors, by what they are", () => {
    expect(sanitizeJobError("jane.doe@example.com").message).toBe("string");
    expect(sanitizeJobError({ message: "jane.doe@example.com", code: "57P01" }).message).toBe("Error 57P01");
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
