// Temporary passwords are long enough for the api, easy to read aloud, and different every time.
import { newPassword } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { temporaryPassword } from "@/organization/staff/temporary-password";

describe("temporaryPassword", () => {
  it("is 12 characters with no look-alikes (0 O 1 l I), and the api accepts it", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const password = temporaryPassword();
      expect(password).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{12}$/);
      expect(newPassword.safeParse(password).success).toBe(true);
    }
  });

  it("differs every time", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => temporaryPassword()));
    expect(passwords.size).toBe(20);
  });
});
