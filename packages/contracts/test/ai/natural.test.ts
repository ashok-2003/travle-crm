// The natural agent's carried facts: apart from lite's, with their defaults, and told totals without pay-in-full.
import { describe, expect, it } from "vitest";
import { naturalFacts, toldTotal } from "../../src/ai/natural.js";

const packageId = "0192f3a0-0000-7000-8000-000000000001";

describe("the natural agent's facts", () => {
  it("keeps facts apart from lite's", () => {
    expect(naturalFacts.safeParse({ agent: "lite" }).success).toBe(false);
    expect(naturalFacts.parse({ agent: "natural" })).toMatchObject({ offer: null, told: [], lastTurnAt: null });
  });

  it("starts a new chat with nothing sent, offered, told or booked", () => {
    expect(naturalFacts.parse({ agent: "natural" })).toEqual({
      agent: "natural",
      leadId: null,
      sentTripIds: [],
      sentFileIds: [],
      offer: null,
      told: [],
      bookingId: null,
      lastTurnAt: null,
    });
  });

  it("keeps a told total's terms without pay-in-full", () => {
    const told = toldTotal.parse({
      packageId,
      startsOn: "2026-12-13",
      adults: 2,
      childrenAges: [],
      room: "double",
      payInFull: true,
      totalPaise: 2_599_800,
      at: "2026-11-14T18:13:00.000Z",
    });
    expect(told).not.toHaveProperty("payInFull");
    expect(told).toMatchObject({ totalPaise: 2_599_800, room: "double" });
  });
});
