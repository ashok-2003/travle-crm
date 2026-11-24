// The customer's language by the words of their new lines: Hindi for Devanagari, Hinglish for a Hinglish word, else
// English.
import { describe, expect, it } from "vitest";
import { languageOf } from "../../../src/ai/natural/language-of.js";

describe("the customer's language", () => {
  it("is Hindi for Devanagari, Hinglish for 'kitna hai', and English otherwise", () => {
    expect(languageOf("केदारकांठा का रेट क्या है?")).toBe("hindi");
    expect(languageOf("Kedarkantha ka rate kitna hai")).toBe("hinglish");
    expect(languageOf("Kedarkantha ka price?")).toBe("hinglish");
    expect(languageOf("Trek ki details bhejo")).toBe("hinglish");
    expect(languageOf("Please send me the details")).toBe("english");
    // A particle counts only in lower case: "Ko Samui" is a place.
    expect(languageOf("What's the price for Ko Samui?")).toBe("english");
    expect(languageOf("What does the Kedarkantha trek cost?")).toBe("english");
    expect(languageOf("")).toBe("english");
  });
});
