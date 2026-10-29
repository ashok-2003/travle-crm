// A trip's keywords set it off by themselves in every chat, so a short one ("hi", "ok") is refused.
import { describe, expect, it } from "vitest";
import { createTripKitInput } from "../src/inbox/index.js";

const trip = { name: "Goa", message: "Itinerary", autoSend: true };

describe("a trip's keywords", () => {
  it("need at least three letters", () => {
    expect(createTripKitInput.safeParse({ ...trip, keywords: ["goa", "kullu manali"] }).success).toBe(true);
    expect(createTripKitInput.safeParse({ ...trip, keywords: ["hi"] }).success).toBe(false);
    expect(createTripKitInput.safeParse({ ...trip, keywords: ["  ok "] }).success).toBe(false);
  });
});
