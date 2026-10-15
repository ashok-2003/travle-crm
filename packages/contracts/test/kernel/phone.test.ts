// Phone numbers are saved in E.164 (spec 9.6), whatever form people type them in; India is the default country.
import { describe, expect, it } from "vitest";
import { phoneNumber, toE164 } from "../../src/kernel/index.js";

describe("phone numbers", () => {
  it("normalise the forms Indian numbers are typed in", () => {
    for (const typed of ["98765 43210", "+91 98765-43210", "09876543210", "919876543210", " +919876543210 "]) {
      expect(phoneNumber.parse(typed), typed).toBe("+919876543210");
    }
    expect(toE164("080 2345 6789")).toBe("+918023456789");
  });

  it("keep international numbers in their own country", () => {
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
    expect(toE164("020 7946 0958", "GB")).toBe("+442079460958");
  });

  it("refuse what isn't a whole phone number, and extensions E.164 can't hold", () => {
    for (const bad of ["12345", "+91 98765 4321", "abc", "", "9876543210 ext 2"]) {
      expect(toE164(bad), bad).toBeNull();
      expect(phoneNumber.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("phone number ranges", () => {
  it("refuse numbers in ranges that don't exist", () => {
    for (const bad of ["5555555555", "+91 5555555555", "1000000000", "1111111111"]) {
      expect(toE164(bad), bad).toBeNull();
    }
  });

  it("accept real mobile and landline numbers from the library's own examples", () => {
    expect(toE164("8123456789")).toBe("+918123456789");
    expect(toE164("+91 98765 43210")).toBe("+919876543210");
    expect(toE164("011 2345 6789")).toBe("+911123456789");
  });
});
