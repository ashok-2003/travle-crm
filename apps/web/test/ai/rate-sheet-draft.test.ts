// The review of a rate sheet (release ai3b): rows start unticked, a rate the supplier already has at the same price is left out, one
// at another price shows its old price and is changed by id only while it is still that rate, Save needs every row ticked and valid,
// and the save carries what the person made of the rows, never the AI's proposal.
import type { RateSheetProposal } from "@travel-crm/contracts/ai";
import type { RateSeason } from "@travel-crm/contracts/suppliers";
import { describe, expect, it } from "vitest";
import { batchOf, draftOf, saveState, SUPPLIER_SEASON_KEY } from "@/ai/rates/rate-sheet-draft";

const SUPPLIER = "11111111-1111-4111-8111-111111111111";
const FILL = "22222222-2222-4222-8222-222222222222";
const SEASON = "33333333-3333-4333-8333-333333333333";
const RATE = "44444444-4444-4444-8444-444444444444";

const row = (overrides: Partial<RateSheetProposal["rates"][number]> = {}): RateSheetProposal["rates"][number] => ({
  ref: "r1",
  seasonRef: 0,
  item: "Deluxe room",
  mealPlan: "MAP",
  occupancy: "double",
  unit: "per_room_night",
  printedPrice: "₹4,500",
  costPaise: 450_000,
  note: "",
  source: "Rates, row 2",
  excerpt: "Deluxe | 4,500",
  checkThis: false,
  existing: null,
  ...overrides,
});
const proposal = (overrides: Partial<RateSheetProposal> = {}): RateSheetProposal => ({
  fillId: FILL,
  seasons: [
    {
      ref: 0,
      label: "Winter",
      startsOn: "2026-10-01",
      endsOn: "2027-03-31",
      printed: "",
      existingSeasonId: null,
      inPast: false,
    },
  ],
  rates: [row(), row({ ref: "r2", item: "Suite", costPaise: 700_000, printedPrice: "7,000" })],
  questions: [],
  parts: ["Rates"],
  part: 0,
  cut: false,
  sources: [],
  usedThisMonth: 1,
  monthlyLimit: 3000,
  ...overrides,
});
const supplierSeasons: RateSeason[] = [
  { id: SEASON, label: "Monsoon", startsOn: "2027-06-01", endsOn: "2027-09-30", rates: [] },
];

describe("the review of a rate sheet", () => {
  it("starts every row unticked, with the price in rupees, and cannot be saved until each is ticked", () => {
    const values = draftOf(proposal());
    expect(values.rows.map((one) => [one.item, one.price, one.checked, one.left])).toEqual([
      ["Deluxe room", "4,500", false, false],
      ["Suite", "7,000", false, false],
    ]);
    expect(saveState(values, supplierSeasons)).toMatchObject({ count: 2, unticked: 2, canSave: false });
    expect(batchOf(values, supplierSeasons, { supplierId: SUPPLIER, fillId: FILL })).toBeNull();
    const first = values.rows[0];
    if (first) first.checked = true;
    expect(saveState(values, supplierSeasons)).toMatchObject({ unticked: 1, canSave: false });
    const second = values.rows[1];
    if (second) second.checked = true;
    expect(saveState(values, supplierSeasons).canSave).toBe(true);
  });

  it("saves what the person made: edited values, the new season, and ticks on every row", () => {
    const values = draftOf(proposal());
    values.rows.forEach((one) => {
      one.checked = true;
    });
    const second = values.rows[1];
    if (second) second.price = "7,100";
    const batch = batchOf(values, supplierSeasons, { supplierId: SUPPLIER, fillId: FILL });
    expect(batch).toEqual({
      supplierId: SUPPLIER,
      fillId: FILL,
      seasons: [{ key: 0, label: "Winter", startsOn: "2026-10-01", endsOn: "2027-03-31" }],
      rates: [
        expect.objectContaining({
          ref: "r1",
          seasonKey: 0,
          item: "Deluxe room",
          mealPlan: "MAP",
          costPaise: 450_000,
          checked: true,
        }),
        expect.objectContaining({ ref: "r2", item: "Suite", costPaise: 710_000 }),
      ],
    });
  });

  it("leaves out a rate the supplier has at the same price, and changes one at another price by id", () => {
    const values = draftOf(
      proposal({
        seasons: [
          {
            ref: 0,
            label: "Winter",
            startsOn: "2026-10-01",
            endsOn: "2027-03-31",
            printed: "",
            existingSeasonId: SEASON,
            inPast: false,
          },
        ],
        rates: [
          row({ existing: { rateId: RATE, costPaise: 450_000 } }),
          row({
            ref: "r2",
            item: "Suite",
            costPaise: 700_000,
            existing: { rateId: "55555555-5555-4555-8555-555555555555", costPaise: 650_000 },
          }),
        ],
      }),
    );
    expect(values.rows.map((one) => [one.already, one.left])).toEqual([
      [true, true],
      [false, false],
    ]);
    const suite = values.rows[1];
    if (suite) suite.checked = true;
    const batch = batchOf(values, supplierSeasons, { supplierId: SUPPLIER, fillId: FILL });
    expect(batch?.seasons).toEqual([{ key: 0, seasonId: SEASON, label: "Winter" }]);
    expect(batch?.rates).toHaveLength(1);
    expect(batch?.rates[0]).toMatchObject({
      ref: "r2",
      rateId: "55555555-5555-4555-8555-555555555555",
      costPaise: 700_000,
    });
    // Edited into another rate, it is a new one, never a change to the supplier's.
    if (suite) suite.item = "Family suite";
    expect(batchOf(values, supplierSeasons, { supplierId: SUPPLIER, fillId: FILL })?.rates[0]?.rateId).toBeUndefined();
  });

  it("recognises a rate the supplier has when the row has no meal plan or occupancy, and changes it by id", () => {
    const values = draftOf(
      proposal({
        seasons: [
          {
            ref: 0,
            label: "Winter",
            startsOn: "2026-10-01",
            endsOn: "2027-03-31",
            printed: "",
            existingSeasonId: SEASON,
            inPast: false,
          },
        ],
        rates: [row({ mealPlan: "", occupancy: "", existing: { rateId: RATE, costPaise: 400_000 } })],
      }),
    );
    const only = values.rows[0];
    if (only) only.checked = true;
    expect(batchOf(values, supplierSeasons, { supplierId: SUPPLIER, fillId: FILL })?.rates[0]?.rateId).toBe(RATE);
  });

  it("names what stops a save: a unit the sheet did not give, a price code could not read, a season with no dates, a duplicate", () => {
    const values = draftOf(
      proposal({
        seasons: [
          {
            ref: 0,
            label: "Winter",
            startsOn: null,
            endsOn: null,
            printed: "1 Oct to 31 Mar",
            existingSeasonId: null,
            inPast: false,
          },
        ],
        rates: [
          row({ unit: null }),
          row({ ref: "r2", item: "Suite", costPaise: null, printedPrice: "4500-5500" }),
          row({ ref: "r3" }),
          row({ ref: "r4" }),
        ],
      }),
    );
    values.rows.forEach((one) => {
      one.checked = true;
    });
    const state = saveState(values, supplierSeasons);
    expect(state.problems.get(0)).toBe("unit");
    expect(state.problems.get(1)).toBe("price");
    expect(state.problems.get(2)).toBeUndefined();
    expect(state.problems.get(3)).toBe("same");
    expect(state.seasons.get(0)).toBe("dates");
    expect(state.canSave).toBe(false);
    // Leaving the faulty rows out opens the save; the season still needs its dates.
    [0, 1, 3].forEach((index) => {
      const one = values.rows[index];
      if (one) one.left = true;
    });
    expect(saveState(values, supplierSeasons).canSave).toBe(false);
    const season = values.seasons[0];
    if (season) {
      season.startsOn = "2026-10-01";
      season.endsOn = "2027-03-31";
    }
    expect(saveState(values, supplierSeasons).canSave).toBe(true);
  });

  it("asks for the season of a row when the sheet has several and did not say, and can use a season the supplier has", () => {
    const values = draftOf(
      proposal({
        seasons: [
          {
            ref: 0,
            label: "Winter",
            startsOn: "2026-10-01",
            endsOn: "2027-03-31",
            printed: "",
            existingSeasonId: null,
            inPast: false,
          },
          {
            ref: 1,
            label: "Summer",
            startsOn: "2027-04-01",
            endsOn: "2027-06-30",
            printed: "",
            existingSeasonId: null,
            inPast: false,
          },
        ],
        rates: [row({ seasonRef: null })],
      }),
    );
    const only = values.rows[0];
    if (only) only.checked = true;
    expect(saveState(values, supplierSeasons).problems.get(0)).toBe("season");
    if (only) only.seasonKey = String(SUPPLIER_SEASON_KEY);
    const batch = batchOf(values, supplierSeasons, { supplierId: SUPPLIER, fillId: FILL });
    expect(batch?.seasons).toEqual([{ key: SUPPLIER_SEASON_KEY, seasonId: SEASON, label: "Monsoon" }]);
  });

  it("gives a sheet with no seasons one blank season to name", () => {
    const values = draftOf(proposal({ seasons: [] }));
    expect(values.seasons).toEqual([expect.objectContaining({ key: 0, label: "", startsOn: "" })]);
    expect(values.rows.every((one) => one.seasonKey === "0")).toBe(true);
  });
});
