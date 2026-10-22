// The form's key: an organization's id and a secret in 38 characters that parse back to the same two, and nothing else.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formKeyOf, newKeySecret, parseFormKey } from "../../src/website-forms/index.js";

describe("the form key", () => {
  it("round-trips an organization id and a secret", () => {
    for (let round = 0; round < 50; round += 1) {
      const organizationId = randomUUID();
      const keySecret = newKeySecret();
      const key = formKeyOf(organizationId, keySecret);
      expect(key).toHaveLength(38);
      expect(key).toMatch(/^[A-Za-z0-9_-]{38}$/);
      expect(parseFormKey(key)).toEqual({ organizationId, keySecret });
    }
  });

  it("makes a 16-character secret from the 64-character alphabet, different each time", () => {
    const secrets = new Set(Array.from({ length: 100 }, newKeySecret));
    expect(secrets.size).toBe(100);
    for (const secret of secrets) expect(secret).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("rejects a 37 or 39 character key, a bad alphabet, and an id spelled another way", () => {
    const key = formKeyOf(randomUUID(), newKeySecret());
    expect(parseFormKey(key.slice(0, 37))).toBeNull();
    expect(parseFormKey(`${key}A`)).toBeNull();
    expect(parseFormKey(`${key.slice(0, 37)}!`)).toBeNull();
    expect(parseFormKey(`${key.slice(0, 20)} ${key.slice(21)}`)).toBeNull();
    expect(parseFormKey("")).toBeNull();
    // The 22nd character holds two spare bits; a key whose spare bits are set is not one formKeyOf wrote.
    const spare = key.charAt(21) === "B" ? "C" : "B";
    expect(parseFormKey(key.slice(0, 21) + spare + key.slice(22))).toBeNull();
  });

  it("refuses to make a key from a non-uuid or a short secret", () => {
    expect(() => formKeyOf("not-a-uuid", newKeySecret())).toThrow(RangeError);
    expect(() => formKeyOf(randomUUID(), "short")).toThrow(RangeError);
    expect(() => formKeyOf(randomUUID(), "illegal characters")).toThrow(RangeError);
  });
});
