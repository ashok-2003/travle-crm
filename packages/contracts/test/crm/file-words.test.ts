// The words a file holds for the fixed lists (D29): the screen's word first, then what a sheet may say instead, read
// back to the key with case, spaces, dashes and underscores ignored.
import { describe, expect, it } from "vitest";
import { keyOfWord, leadFileWords, wordOf } from "../../src/crm/index.js";

describe("the words a file holds", () => {
  it("reads every word a file holds back to its key, and B11's stage words: Booked as won, Junk as not_a_lead", () => {
    for (const [field, words] of Object.entries(leadFileWords)) {
      for (const [key, [shown, ...alsoRead]] of Object.entries(words)) {
        const typedField = field as keyof typeof leadFileWords;
        expect(wordOf(typedField, key), `${field}.${key}`).toBe(shown);
        for (const word of [shown, ...alsoRead, key, ` ${shown.toUpperCase()} `]) {
          expect(keyOfWord(typedField, word), `${field}: ${word}`).toBe(key);
        }
      }
    }
    const stages: [string, string][] = [
      ["Booked", "won"],
      ["confirmed", "won"],
      ["Converted", "won"],
      ["Not interested", "lost"],
      ["DROPPED", "lost"],
      ["Cancelled", "lost"],
      ["Called", "contacted"],
      ["Follow-up", "contacted"],
      ["In progress", "contacted"],
      ["Quoted", "quote_sent"],
      ["quote_sent", "quote_sent"],
      ["Junk", "not_a_lead"],
      ["Spam", "not_a_lead"],
      ["Fake", "not_a_lead"],
    ];
    for (const [word, key] of stages) expect(keyOfWord("stage", word), word).toBe(key);
    expect(keyOfWord("hotelCategory", "4 stars")).toBe("4_star");
    expect(keyOfWord("food", "Non veg")).toBe("non_veg");
    expect(keyOfWord("budgetBasis", "PP")).toBe("per_person");
    expect(keyOfWord("source", "Walk-in")).toBe("walk_in");
    expect(keyOfWord("source", "Import")).toBe("bulk_upload");
    expect(keyOfWord("stage", "Thinking about it")).toBeNull();
    expect(keyOfWord("tripType", "")).toBeNull();
  });
});
