// @vitest-environment node
// A stored number as the phone field shows it (phoneAsTyped), for every form that edits one: an Indian one grouped
// after the field's own +91, any other whole with its own + code, and none as an empty box.
import { describe, expect, it } from "vitest";
import { phoneAsTyped } from "@/components/forms/phone-field";

describe("phoneAsTyped", () => {
  it("writes an Indian number as typed after the field's +91", () => {
    expect(phoneAsTyped("+919820012345")).toBe("98200 12345");
  });

  it("keeps a number from elsewhere whole, with its own + code", () => {
    expect(phoneAsTyped("+442079460958")).toBe("+442079460958");
  });

  it("leaves the box empty for no number", () => {
    expect(phoneAsTyped(null)).toBe("");
    expect(phoneAsTyped("")).toBe("");
  });
});
