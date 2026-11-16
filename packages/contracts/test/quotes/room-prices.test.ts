// Room prices: refused with unknown keys as an input, stripped of them as an output (the contracts' rule).
import { describe, expect, it } from "vitest";
import { makeGroupQuoteInput, packageSeason, roomPrices, roomPricesOutput } from "../../src/quotes/index.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

describe("room prices", () => {
  it("an input refuses an unknown key", () => {
    expect(roomPrices.safeParse({ ...none, penthouse: 1 }).success).toBe(false);
  });

  it("an output strips it, in its own shape and inside a season", () => {
    expect(roomPricesOutput.parse({ ...none, penthouse: 1 })).toEqual(none);
    const season = packageSeason.parse({
      id: "0190a000-0000-7000-8000-0000000000a1",
      label: "Peak",
      startsOn: "2026-10-01",
      endsOn: "2026-12-15",
      prices: { ...none, double: 1250000, penthouse: 1 },
    });
    expect(season.prices).toEqual({ ...none, double: 1250000 });
  });

  it("a group quote with the same room type twice is refused", () => {
    const id = "0190a000-0000-7000-8000-0000000000a1";
    const input = (rooms: unknown[]) =>
      makeGroupQuoteInput.safeParse({ leadId: id, packageId: id, departureId: id, rooms });
    expect(
      input([
        { roomType: "double", people: 2 },
        { roomType: "double", people: 2 },
      ]).success,
    ).toBe(false);
    expect(
      input([
        { roomType: "double", people: 2 },
        { roomType: "single", people: 1 },
      ]).success,
    ).toBe(true);
  });
});
