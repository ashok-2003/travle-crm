// Two rules of sales execution that need no database: automatic WhatsApps go between 10:00 and 20:00 in the agency's
// zone (else at the next 10:00), and a buying word counts only as a whole word or phrase.
import { describe, expect, it } from "vitest";
import { workingMoment } from "../../src/sales/cadence.js";
import { holdsBuyingWord } from "../../src/sales/signals.js";

const IST = "Asia/Kolkata";

describe("workingMoment", () => {
  it("keeps a moment inside working hours", () => {
    const at = new Date("2026-11-02T06:30:00Z"); // 12:00 in India
    expect(workingMoment(at, IST)).toEqual(at);
  });

  it("moves an early morning to 10:00 that day", () => {
    expect(workingMoment(new Date("2026-11-02T01:00:00Z"), IST).toISOString()).toBe("2026-11-02T04:30:00.000Z");
  });

  it("moves a late evening to 10:00 the next day", () => {
    expect(workingMoment(new Date("2026-11-02T16:00:00Z"), IST).toISOString()).toBe("2026-11-03T04:30:00.000Z");
  });
});

describe("holdsBuyingWord", () => {
  const words = ["price", "book", "kitna", "advance payment"];

  it("finds a word in any case, among punctuation", () => {
    expect(holdsBuyingWord("Manali package ka PRICE kya hai?", words)).toBe(true);
  });

  it("finds a phrase whatever the marks between its words", () => {
    expect(holdsBuyingWord("advance-payment kaise karu", words)).toBe(true);
  });

  it("never matches inside another word", () => {
    expect(holdsBuyingWord("Facebook pe dekha", words)).toBe(false);
    expect(holdsBuyingWord("pricey hai", words)).toBe(false);
  });
});
