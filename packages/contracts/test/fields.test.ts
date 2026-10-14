// The shared field rules accept what people really type and normalise it the way sign-in compares it.
import { describe, expect, it } from "vitest";
import {
  emailAddress,
  newPassword,
  organizationCode,
  roleKey,
  personName,
  roleName,
  shownEmailAddress,
  staffUsername,
} from "../src/identity/index.js";

describe("identity fields", () => {
  it("reads organization codes in any case and stores them in capitals", () => {
    expect(organizationCode.parse(" sharma ")).toBe("SHARMA");
    expect(organizationCode.parse("Goa24")).toBe("GOA24");
    for (const bad of ["SH", "SHARMA-HOLIDAYS", "THIRTEENCHARS", "शर्मा"]) {
      expect(organizationCode.safeParse(bad).success).toBe(false);
    }
  });

  it("keeps usernames as typed and refuses spaces and non-Latin letters", () => {
    expect(staffUsername.parse(" Ravi.K ")).toBe("Ravi.K");
    for (const bad of ["r", "ravi kumar", "rávi", "a".repeat(33)]) {
      expect(staffUsername.safeParse(bad).success).toBe(false);
    }
  });

  it("lowercases and trims emails, and refuses placeholder addresses", () => {
    expect(emailAddress.parse("  Ravi@Sharma.IN ")).toBe("ravi@sharma.in");
    expect(emailAddress.safeParse("sharma-ravi@no-email.invalid").success).toBe(false);
    expect(emailAddress.safeParse("not-an-email").success).toBe(false);
  });

  it("refuses placeholder addresses in any letter case", () => {
    expect(emailAddress.safeParse("a@no-email.INVALID").success).toBe(false);
    expect(shownEmailAddress.safeParse("a@no-email.INVALID").success).toBe(false);
    expect(shownEmailAddress.safeParse("A@B.Invalid").success).toBe(false);
  });

  it("refuses emails longer than 254 characters", () => {
    const tooLong = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(60)}.in`;
    expect(tooLong.length).toBeGreaterThan(254);
    expect(emailAddress.safeParse(tooLong).success).toBe(false);
    expect(shownEmailAddress.safeParse(tooLong).success).toBe(false);
  });

  it("refuses organization codes that only become valid by Unicode case mapping", () => {
    expect(organizationCode.safeParse("ſharma").success).toBe(false);
  });

  it("refuses names that are invisible or carry control and bidi characters", () => {
    for (const schema of [personName, roleName]) {
      expect(schema.safeParse("\u200B\u200B").success).toBe(false);
      expect(schema.safeParse("Ravi\u202EKumar").success).toBe(false);
      expect(schema.safeParse("Ravi\u0000").success).toBe(false);
    }
    expect(personName.safeParse("रवि कुमार").success).toBe(true);
  });

  it("refuses to show a placeholder email", () => {
    expect(shownEmailAddress.safeParse("ravi@sharma.in").success).toBe(true);
    expect(shownEmailAddress.safeParse("removed-0199@no-email.invalid").success).toBe(false);
  });

  it("needs new passwords of 10 to 128 characters, used exactly as typed", () => {
    expect(newPassword.parse(" spaces count ")).toBe(" spaces count ");
    expect(newPassword.safeParse("short").success).toBe(false);
    expect(newPassword.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("matches the database's role key format", () => {
    expect(roleKey.safeParse("senior-sales-3f9a2c").success).toBe(true);
    for (const bad of ["Sales", "2nd", "s", "sales manager"]) {
      expect(roleKey.safeParse(bad).success).toBe(false);
    }
  });
});
