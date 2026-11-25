// The owner's no-dash rule (2026-11-25): a dash between words reads as AI, so a reply's dashes become commas.
import { describe, expect, it } from "vitest";
import { withoutDashes } from "../../../src/ai/one/dashes.js";

describe("withoutDashes", () => {
  it("turns a spaced em dash between words into a comma", () => {
    expect(withoutDashes("Hi Suyash, thanks — I've sent the brochure.")).toBe(
      "Hi Suyash, thanks, I've sent the brochure.",
    );
    expect(withoutDashes("Done — two adults for 6 Dec.")).toBe("Done, two adults for 6 Dec.");
  });

  it("turns an unspaced em dash and a spaced en dash into a comma too", () => {
    expect(withoutDashes("Got it—payment received.")).toBe("Got it, payment received.");
    expect(withoutDashes("Perfect – double room it is.")).toBe("Perfect, double room it is.");
  });

  it("adds no comma after punctuation that is already there", () => {
    expect(withoutDashes("Kaunsi date? — Manali ya Spiti")).toBe("Kaunsi date? Manali ya Spiti");
    expect(withoutDashes("Haan, — mil gaya")).toBe("Haan, mil gaya");
  });

  it("drops a dash at the start or the end of a line", () => {
    expect(withoutDashes("— Manali 25 Dec\n— Spiti 25 Dec")).toBe("Manali 25 Dec\nSpiti 25 Dec");
    expect(withoutDashes("Ek minute —\nconfirm karke batate hain")).toBe("Ek minute\nconfirm karke batate hain");
  });

  it("keeps an unspaced en dash, a range or a route, and plain hyphens", () => {
    expect(withoutDashes("Manali–Kasol, 4–5 nights, 4N/5D, union-cab")).toBe(
      "Manali–Kasol, 4–5 nights, 4N/5D, union-cab",
    );
  });

  it("keeps the line between two messages", () => {
    expect(withoutDashes("Brochure bhej diya.\n---\nKab nikalna hai?")).toBe(
      "Brochure bhej diya.\n---\nKab nikalna hai?",
    );
  });
});
