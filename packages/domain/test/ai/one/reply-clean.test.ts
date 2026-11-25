// What never reaches the customer (the owner, 2026-11-26): trip and brochure IDs and the agent's tool calls written as
// words, copied from live replies; a reply that is code is no reply.
import { describe, expect, it } from "vitest";
import { cleanReply } from "../../../src/ai/one/reply-clean.js";

describe("cleanReply", () => {
  it("drops trip and brochure IDs in brackets, alone or together", () => {
    expect(cleanReply("We only run 4N/5D (T6) and 5N/6D (T7) for Manali.")).toBe(
      "We only run 4N/5D and 5N/6D for Manali.",
    );
    expect(cleanReply("Kashmir 7N/8D itinerary (B6) bhej diya.")).toBe("Kashmir 7N/8D itinerary bhej diya.");
    expect(cleanReply("Manali batches (T7/T8) mein hai.")).toBe("Manali batches mein hai.");
    expect(cleanReply("kya woh *4N/5D (Manali T7)* hai?")).toBe("kya woh *4N/5D (Manali)* hai?");
  });

  it("drops bare IDs and keeps the sentence", () => {
    expect(cleanReply("Ye B11 Spiti Full Circuit brochure bhej diya.")).toBe(
      "Ye Spiti Full Circuit brochure bhej diya.",
    );
    expect(cleanReply("4 December ke liye T4 batch available hai!")).toBe("4 December ke liye batch available hai!");
    expect(cleanReply("Aap T4 ya T5 me se kaun sa dekhna chahenge?")).toBe("Aap ya me se kaun sa dekhna chahenge?");
  });

  it("drops the agent's tool calls written as words", () => {
    expect(cleanReply('`update_lead(adults: 2, room: "double", trip_id: "T5")`Manali mein hotel stay hai.')).toBe(
      "Manali mein hotel stay hai.",
    );
    expect(cleanReply('→ send_brochure(brochure_id: "B4")\nYe raha plan. Kab ka plan hai?')).toBe(
      "Ye raha plan. Kab ka plan hai?",
    );
  });

  it("keeps words that only look alike: B2B, 4N/5D, prices and dates", () => {
    const words = "B2B rates nahi hain. 4N/5D ₹5,999, 12 Dec ko batch hai.";
    expect(cleanReply(words)).toBe(words);
  });

  it("keeps the line between two messages", () => {
    expect(cleanReply("Brochure (B2) bhej diya.\n---\nKab nikalna hai?")).toBe(
      "Brochure bhej diya.\n---\nKab nikalna hai?",
    );
  });

  it("gives nothing for a reply that is code", () => {
    expect(cleanReply('```json\n{"trip_id": "T3", "adults": 4}\n```')).toBe("");
    expect(cleanReply('{"outcome":"superseded"}')).toBe("");
    expect(cleanReply('→ update_lead(trip: "T5")')).toBe("");
  });
});
