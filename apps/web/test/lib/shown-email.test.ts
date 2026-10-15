// A placeholder address is never shown, whatever its case; a real one is.
import { describe, expect, it } from "vitest";
import { shownEmail } from "@/lib/shown-email";

describe("shownEmail", () => {
  it("shows a real address", () => {
    expect(shownEmail("asha@sharma.in")).toBe("asha@sharma.in");
  });

  it("hides the placeholder of staff without email, and nothing at all", () => {
    for (const email of ["sharma-ravi@no-email.invalid", "ASHA.0199A000@STAFF.INVALID", null]) {
      expect(shownEmail(email), String(email)).toBeNull();
    }
  });
});
