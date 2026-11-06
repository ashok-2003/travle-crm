// chatFacts: every field has a default, so an empty object parses, and stored rooms keep working when a key is added later.
import { describe, expect, it } from "vitest";
import { chatFacts } from "../../src/ai/grounded.js";

describe("chatFacts", () => {
  it("parses {} to the empty facts", () => {
    expect(chatFacts.parse({})).toEqual({
      places: [],
      notRun: [],
      startsOn: null,
      month: null,
      rooms: [],
      travellers: null,
      budgetPaise: null,
      pickupCity: null,
      packageId: null,
      departureId: null,
      sentFileIds: [],
      paymentSentFor: null,
      bookingId: null,
    });
  });

  it("reads a stored room with an extra key instead of refusing the row", () => {
    const facts = chatFacts.parse({ rooms: [{ roomType: "double", people: 2, note: "new" }] });
    expect(facts.rooms).toEqual([{ roomType: "double", people: 2 }]);
  });

  it("refuses a bad month or date", () => {
    expect(chatFacts.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(chatFacts.safeParse({ startsOn: "tomorrow" }).success).toBe(false);
  });
});
