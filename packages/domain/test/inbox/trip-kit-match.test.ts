// Which trip a customer's message sends by itself (trip details): a keyword, a word or a phrase, standing whole in the
// message in any case, never inside another word.
import { describe, expect, it } from "vitest";
import { tripKitFor } from "../../src/inbox/trip-kit-send.js";

const kits = [
  { id: "goa", keywords: ["goa"] },
  { id: "kullu", keywords: ["kullu manali", "kasol"] },
];

describe("tripKitFor", () => {
  it("finds a word in any case, among punctuation", () => {
    expect(tripKitFor("Hi! GOA package price?", kits)?.id).toBe("goa");
  });

  it("finds a phrase whatever the spaces and marks between its words", () => {
    expect(tripKitFor("details for kullu-manali trip pls", kits)?.id).toBe("kullu");
  });

  it("never matches inside another word", () => {
    expect(tripKitFor("I love goan food", kits)).toBeUndefined();
    expect(tripKitFor("manali only", kits)).toBeUndefined();
  });
});
