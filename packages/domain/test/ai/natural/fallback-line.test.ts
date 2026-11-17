// The fallback line (spec 3.6, ruling 18): the one fixed customer text, in the language of the customer's new lines.
import { describe, expect, it } from "vitest";
import { fallbackLine } from "../../../src/ai/natural/fallback-line.js";

describe("the fallback line", () => {
  it("answers in Hindi for Devanagari, Hinglish for 'kitna hai', and English otherwise", () => {
    expect(fallbackLine("केदारकांठा का रेट क्या है?")).toBe("एक मिनट, चेक करके यहीं बताते हैं।");
    expect(fallbackLine("Kedarkantha ka rate kitna hai")).toBe("Ek minute, check karke yahin batate hain.");
    expect(fallbackLine("Kedarkantha ka price?")).toBe("Ek minute, check karke yahin batate hain.");
    expect(fallbackLine("Trek ki details bhejo")).toBe("Ek minute, check karke yahin batate hain.");
    expect(fallbackLine("Please send me the details")).toBe("Let me check this and get back to you here.");
    // A particle counts only in lower case: "Ko Samui" is a place.
    expect(fallbackLine("What's the price for Ko Samui?")).toBe("Let me check this and get back to you here.");
    expect(fallbackLine("What does the Kedarkantha trek cost?")).toBe("Let me check this and get back to you here.");
    expect(fallbackLine("")).toBe("Let me check this and get back to you here.");
  });
});
