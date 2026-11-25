// seasonColumns: seasons with the same label and prices are one column; the open column leads, then the one covering most days.
import { describe, expect, it } from "vitest";
import { OPEN_SEASON_END, savePriceTableInput, seasonColumns, type PackageSeasonView } from "../../src/quotes/index.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const season = (id: string, label: string, startsOn: string, endsOn: string, double: number): PackageSeasonView => ({
  id,
  label,
  startsOn,
  endsOn,
  prices: { ...none, double },
});

describe("seasonColumns", () => {
  it("groups Regular split around Christmas into one column, Regular first", () => {
    const columns = seasonColumns([
      season("a", "Regular", "2026-10-01", "2026-12-19", 1000),
      season("b", "Christmas", "2026-12-20", "2026-12-31", 2000),
      season("c", "Regular", "2027-01-01", "2027-03-31", 1000),
    ]);
    expect(columns.map((column) => column.label)).toEqual(["Regular", "Christmas"]);
    expect(columns[0]).toMatchObject({ key: "a", seasonIds: ["a", "c"], open: false });
    expect(columns[0]?.ranges).toHaveLength(2);
  });

  it("keeps the same label with different prices as two columns", () => {
    const columns = seasonColumns([
      season("a", "Regular", "2026-10-01", "2026-10-31", 1000),
      season("b", "Regular", "2026-11-01", "2026-11-30", 1100),
    ]);
    expect(columns).toHaveLength(2);
  });

  it("puts an open-ended column first", () => {
    const columns = seasonColumns([
      season("a", "Winter", "2026-10-01", "2027-03-31", 1000),
      season("b", "From April", "2027-04-01", OPEN_SEASON_END, 1500),
    ]);
    expect(columns.map((column) => [column.label, column.open])).toEqual([
      ["From April", true],
      ["Winter", false],
    ]);
  });
});

describe("savePriceTableInput", () => {
  const id = "0190a000-0000-7000-8000-0000000000a1";
  it("refuses a column with no price among the room types, with the column's path", () => {
    const result = savePriceTableInput.safeParse({
      packageId: id,
      roomTypes: ["double"],
      columns: [{ seasonIds: [id], label: "Regular", prices: { ...none, single: 5 } }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["columns", 0, "prices"]);
  });

  it("refuses a season named twice, across columns too", () => {
    const column = { label: "Regular", prices: { ...none, double: 5 } };
    const result = savePriceTableInput.safeParse({
      packageId: id,
      roomTypes: ["double"],
      columns: [
        { seasonIds: [id], ...column },
        { seasonIds: [id], ...column },
      ],
    });
    expect(result.success).toBe(false);
  });
});
