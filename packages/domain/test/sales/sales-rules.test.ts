// A rule of sales execution that needs no database: a buying word counts only as a whole word or phrase.
import { describe, expect, it } from "vitest";
import { holdsBuyingWord } from "../../src/sales/signals.js";

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
