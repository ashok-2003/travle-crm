// @vitest-environment node
// A file's words are the screen's (D29): what an export writes for a stage, a trip type, a hotel category, food, a
// budget's basis and a source is exactly what the Leads screens show, so an export reads as the app does.
import { leadFileWords } from "@travel-crm/contracts/crm";
import { describe, expect, it } from "vitest";
import leads from "@/i18n/messages/en-IN/leads.json";

const screenWords = {
  stage: leads.stages,
  tripType: leads.tripTypes,
  hotelCategory: leads.hotelCategories,
  food: leads.food,
  budgetBasis: leads.budgetBasis,
  source: leads.sources,
};

describe("the words a file holds", () => {
  it("holds the words a file holds equal to the screen's", () => {
    for (const [field, words] of Object.entries(leadFileWords)) {
      const shown = Object.fromEntries(Object.entries(words).map(([key, [word]]) => [key, word]));
      expect(shown, field).toEqual(screenWords[field as keyof typeof screenWords]);
    }
  });
});
