// Stored usernames, placeholder emails and role keys: unique, recognisable, and never shown.
import { describe, expect, it } from "vitest";
import { roleKeyFor } from "../../src/identity/role-key.js";
import {
  INTERNAL_USERNAME_PATTERN,
  internalUsername,
  isPlaceholderEmail,
  placeholderEmail,
  removedPersonEmail,
  shownEmail,
} from "../../src/identity/sign-in-names.js";

describe("sign-in names", () => {
  it("store usernames with their organization code, in lower case", () => {
    expect(internalUsername("SHARMA", "Ravi.K")).toBe("sharma:ravi.k");
    expect(INTERNAL_USERNAME_PATTERN.test(internalUsername("SHARMA", "Ravi.K"))).toBe(true);
  });

  it("give staff without email a placeholder that is never shown", () => {
    const email = placeholderEmail("SHARMA", "Ravi");
    expect(email).toBe("sharma-ravi@no-email.invalid");
    expect(isPlaceholderEmail(email)).toBe(true);
    expect(shownEmail(email)).toBeNull();
    expect(shownEmail("ravi@sharma.in")).toBe("ravi@sharma.in");
    expect(isPlaceholderEmail(removedPersonEmail("0199c3a2-0000-7000-8000-000000000001"))).toBe(true);
  });
});

describe("role keys", () => {
  it("are readable for Latin names and valid for any name", () => {
    expect(roleKeyFor("Senior Sales", "3f9a2c")).toBe("senior-sales-3f9a2c");
    expect(roleKeyFor("Café crew", "3f9a2c")).toBe("cafe-crew-3f9a2c");
    expect(roleKeyFor("बिक्री टीम", "3f9a2c")).toBe("role-3f9a2c");
    expect(roleKeyFor("2nd shift", "3f9a2c")).toBe("role-2nd-shift-3f9a2c");
    expect(roleKeyFor("x".repeat(40), "3f9a2c")).toBe(`${"x".repeat(32)}-3f9a2c`);
  });

  it("match the database's role_key_format check", () => {
    for (const name of ["Senior Sales", "बिक्री", "!!!", "2nd shift", "Owner", "a".repeat(40)]) {
      expect(roleKeyFor(name)).toMatch(/^[a-z][a-z0-9-]{1,47}$/);
    }
  });
});
