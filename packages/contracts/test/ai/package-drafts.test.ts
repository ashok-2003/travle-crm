// Package drafts: a price keeps every alternative a source gave, and the create input is strict.
import { describe, expect, it } from "vitest";
import {
  createGroupPackageInput,
  draftSeason,
  foundTrips,
  MAX_DRAFT_DAYS,
  MAX_FOUND_TRIPS,
} from "../../src/ai/package-drafts.js";

const evidence = [{ token: "L1", source: "Knowledge: Manali", excerpt: "Double 6,999" }];
const price = (value: number) => ({ value, evidence, checkThis: false });
const none = { single: [], double: [], triple: [], quad: [], child_bed: [], child_no_bed: [] };
const noPrices = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

const valid = {
  fillId: "0192f3a0-0000-7000-8000-000000000001",
  name: "Manali 5N",
  title: "Manali 5 Nights",
  destinationName: "Manali",
  nights: 5,
  roomTypes: ["double"],
  weeklyDays: [5],
  departureMonths: [],
  seatsPerDeparture: 20,
  seasons: [{ label: "Summer", startsOn: "2027-04-01", endsOn: "2027-06-30", prices: { ...noPrices, double: 6999 } }],
  pricesIncludeGst: true,
  advancePerPersonPaise: 500000,
  pickupPoints: "",
  startCity: "Delhi",
  inclusions: "",
  exclusions: "",
  cancellationNotes: "",
  summary: "",
  highlights: [],
  days: [],
  brochureKnowledgeId: null,
  appliedFields: ["name"],
};

describe("package drafts", () => {
  it("a draft keeps every alternative of a price", () => {
    const season = draftSeason.parse({
      label: { value: "Summer", evidence, checkThis: false },
      startsOn: "2027-04-01",
      endsOn: "2027-06-30",
      prices: { ...none, double: [price(699900), price(749900)] },
    });
    expect(season.prices.double.map((alternative) => alternative.value)).toEqual([699900, 749900]);
  });

  it("createGroupPackageInput refuses unknown keys and an end before a start", () => {
    expect(createGroupPackageInput.safeParse(valid).success).toBe(true);
    expect(createGroupPackageInput.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    const backwards = { ...valid.seasons[0], startsOn: "2027-07-01" };
    expect(createGroupPackageInput.safeParse({ ...valid, seasons: [backwards] }).success).toBe(false);
  });

  it("an over-long trips list, days list or applied-fields list is refused", () => {
    const trip = {
      ref: "t",
      name: "n",
      placeWords: "p",
      destinationId: null,
      destinationName: null,
      nights: null,
      evidence: [],
    };
    const trips = Array.from({ length: MAX_FOUND_TRIPS + 1 }, () => trip);
    const list = { fillId: valid.fillId, trips, parts: [], readPart: null };
    expect(foundTrips.safeParse(list).success).toBe(false);
    expect(foundTrips.safeParse({ ...list, trips: trips.slice(1) }).success).toBe(true);
    const days = Array.from({ length: MAX_DRAFT_DAYS + 1 }, () => ({ title: "Day", description: "" }));
    expect(createGroupPackageInput.safeParse({ ...valid, days }).success).toBe(false);
    const fields = Array.from({ length: 41 }, () => "name");
    expect(createGroupPackageInput.safeParse({ ...valid, appliedFields: fields }).success).toBe(false);
    expect(createGroupPackageInput.safeParse({ ...valid, appliedFields: ["x".repeat(41)] }).success).toBe(false);
  });
});
