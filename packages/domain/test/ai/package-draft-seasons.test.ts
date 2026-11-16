// A season named by its months becomes the next real dates in the agency's calendar: this year's until it is over, then next year's.
import { describe, expect, it } from "vitest";
import { seasonDates } from "../../src/ai/drafts/season-dates.js";
import { parseCalendarDate } from "../../src/kernel/index.js";

const day = parseCalendarDate;

describe("season dates", () => {
  it("Nov is this November until it is over, then next year's", () => {
    expect(seasonDates({ from: 11, to: 11 }, day("2026-11-02"))).toEqual({
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    });
    expect(seasonDates({ from: 11, to: 11 }, day("2026-11-30"))).toEqual({
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    });
    expect(seasonDates({ from: 11, to: 11 }, day("2026-12-01"))).toEqual({
      startsOn: "2027-11-01",
      endsOn: "2027-11-30",
    });
  });

  it("Dec–Jan ends in January of the next year", () => {
    expect(seasonDates({ from: 12, to: 1 }, day("2026-11-02"))).toEqual({
      startsOn: "2026-12-01",
      endsOn: "2027-01-31",
    });
    // Already inside it in January: the one that ends this January.
    expect(seasonDates({ from: 12, to: 1 }, day("2027-01-10"))).toEqual({
      startsOn: "2026-12-01",
      endsOn: "2027-01-31",
    });
  });

  it("the last day of February follows the year", () => {
    expect(seasonDates({ from: 2, to: 2 }, day("2027-12-01")).endsOn).toBe("2028-02-29");
  });
});
