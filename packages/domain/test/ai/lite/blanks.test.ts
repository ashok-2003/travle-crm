// The blanks the Write model copies: spacing and case are ignored, anything else in brackets is unknown, spans point at values.
import { describe, expect, it } from "vitest";
import { Blanks, fillBlanks } from "../../../src/ai/lite/blanks.js";
import { oneEmoji, styleProblem } from "../../../src/ai/lite/style.js";

function blanks() {
  const all = new Blanks();
  all.add("package", "Kedarnath Yatra", "a trip", true);
  all.add("date", "Sat 14 Nov", "a departure", false);
  all.add("date", "Sat 21 Nov", "a departure", false);
  all.add("answer", "Pickup is at 6 am from ₹500 parking.", "the agency's answer", false);
  return all;
}

describe("blanks", () => {
  it("names each kind from 1, and the single kinds without a number", () => {
    const all = new Blanks();
    expect([
      all.add("date", "a", "x", false),
      all.add("date", "b", "x", false),
      all.add("agent", "Riya", "x", true),
    ]).toEqual(["[date 1]", "[date 2]", "[agent]"]);
    expect(() => all.add("agent", "Again", "x", true)).toThrow(RangeError);
  });

  it("shows a shown value and only describes a hidden one", () => {
    const lines = blanks().lines();
    expect(lines[0]).toBe("[package 1] = Kedarnath Yatra (a trip)");
    expect(lines[1]).toBe("[date 1]: a departure");
    expect(lines.join("\n")).not.toContain("Sat 14 Nov");
    expect(lines.join("\n")).not.toContain("₹500");
  });

  it("[Date 1] and [date  1] fill the same", () => {
    const result = fillBlanks("On [Date 1] or [date  2].", blanks().values());
    expect(result.text).toBe("On Sat 14 Nov or Sat 21 Nov.");
    expect(result.unknown).toEqual([]);
  });

  it("[total] with no such blank is unknown", () => {
    const result = fillBlanks("It is [total] and [date 1].", blanks().values());
    expect(result.unknown).toEqual(["[total]"]);
    expect(result.text).toBe("It is [total] and Sat 14 Nov.");
  });

  it("the spans point at the values, the owner's answer verbatim", () => {
    const text = "See [package 1] on [date 1]: [answer]";
    const result = fillBlanks(text, blanks().values());
    expect(result.filled.map(({ start, end }) => result.text.slice(start, end))).toEqual([
      "Kedarnath Yatra",
      "Sat 14 Nov",
      "Pickup is at 6 am from ₹500 parking.",
    ]);
  });
});

describe("the voice rules", () => {
  it("passes a good reply and names each problem", () => {
    expect(styleProblem("We have two dates. Which do you prefer?", "english")).toBeNull();
    expect(styleProblem("One. Two. Three. Four.", "english")).toBe("sentences");
    expect(styleProblem("Which date? And how many?", "english")).toBe("questions");
    expect(styleProblem("Great question! We run it.", "english")).toBe("filler");
    expect(styleProblem("“Absolutely, yes.", "english")).toBe("filler");
    expect(styleProblem("बिल्कुल, हम चलाते हैं।", "hindi")).toBe("filler");
    expect(styleProblem("Aap kab jaana chahenge?", "hindi")).toBe("script");
    expect(styleProblem("आप कब जाना चाहेंगे?", "hinglish")).toBe("script");
    expect(styleProblem("आप कब जाना चाहेंगे?", "english")).toBe("script");
    expect(styleProblem("Aap kab jaana chahenge?", "hinglish")).toBeNull();
    expect(styleProblem("I’m a bot, happy to help.", "english")).toBe("persona");
    expect(styleProblem("Main insaan hoon.", "hinglish")).toBe("persona");
  });

  it("keeps the first emoji and drops the rest", () => {
    expect(oneEmoji("Hi 🙂 we run it 🏔️ and 👍")).toBe("Hi 🙂 we run it and");
    expect(oneEmoji("No emoji here.")).toBe("No emoji here.");
    expect(oneEmoji("Flag 🇮🇳 and 👨‍👩‍👧")).toBe("Flag 🇮🇳 and");
  });
});
