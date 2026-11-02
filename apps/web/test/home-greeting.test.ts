// Home greets a person by first name, never by title.
import { describe, expect, it } from "vitest";
import { greetingName } from "@/home/greeting-name";

describe("greetingName", () => {
  it.each([
    ["Mr. Anish Sharma", "Anish"],
    ["Dr. Meena Iyer", "Meena"],
    ["Ayush", "Ayush"],
    ["Asha Sharma", "Asha"],
    ["mrs priya nair", "priya"],
    ["MS. Kavya", "Kavya"],
    ["Miss Rao", "Rao"],
    ["Shri Ramesh Gupta", "Ramesh"],
    ["Smt. Lata Devi", "Lata"],
    ["Kumari Divya", "Divya"],
    ["Dr", "Dr"],
  ])("greets %s as %s", (name, expected) => {
    expect(greetingName(name)).toBe(expected);
  });
});
