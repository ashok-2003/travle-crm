// A free-text list as its points, the one rule the staff screens, the customer's page and the PDF share: one point a
// line, blank lines dropped, and a typed bullet taken off only when a space follows it, so "-5% early bird" keeps its minus.
import { describe, expect, it } from "vitest";
import { pointsOf } from "../../src/quotes/index.js";

describe("pointsOf", () => {
  it("takes a typed bullet off only when a space follows it", () => {
    expect(pointsOf("- Stay\n• Breakfast\n* Cab\n✓ Guide\n✗ Lunch")).toEqual([
      "Stay",
      "Breakfast",
      "Cab",
      "Guide",
      "Lunch",
    ]);
    expect(pointsOf("-5% early bird\n*Conditions apply")).toEqual(["-5% early bird", "*Conditions apply"]);
  });

  it("keeps one point a line and drops the blank ones", () => {
    expect(pointsOf("Carry a jacket\r\n\n  \nBring ID  ")).toEqual(["Carry a jacket", "Bring ID"]);
    expect(pointsOf("")).toEqual([]);
  });
});
