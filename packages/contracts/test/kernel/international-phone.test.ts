// A phone as a file shows it (B38): E.164 written the international way, with its country's own spacing.
import { describe, expect, it } from "vitest";
import { internationalPhone } from "../../src/kernel/index.js";

describe("internationalPhone", () => {
  it("writes +919876543210 as +91 98765 43210, and a foreign number in its own form", () => {
    expect(internationalPhone("+919876543210")).toBe("+91 98765 43210");
    expect(internationalPhone("+442079460958")).toBe("+44 20 7946 0958");
    expect(internationalPhone("+14155552671")).toBe("+1 415 555 2671");
    // Not a number libphonenumber knows: as stored, rather than nothing.
    expect(internationalPhone("+999123")).toBe("+999123");
  });
});
