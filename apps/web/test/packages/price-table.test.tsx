// A group trip's price table: a row per room type, a column per season, typed in place and saved once.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { PricesCard } from "@/packages/prices-card";
import { inputsTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aPackage, aSeason, noPrices } from "./detail";

const words = messages.packages.prices;
const regularA = "0190a000-0000-7000-8000-0000000000a1";
const christmas = "0190a000-0000-7000-8000-0000000000a2";
const regularB = "0190a000-0000-7000-8000-0000000000a3";

/** Regular runs with no end, split around Christmas into two pieces that are one column. */
const trip = (changes: Parameters<typeof aPackage>[0] = {}) =>
  aPackage({
    kind: "group",
    roomTypes: ["double", "triple"],
    seasons: [
      aSeason(regularA, "Regular", "2027-01-01", "2027-12-17", { double: 600_000, triple: 550_000 }),
      aSeason(christmas, "Christmas", "2027-12-18", "2028-01-01", { double: 900_000, triple: 850_000 }),
      aSeason(regularB, "Regular", "2028-01-02", "2099-12-31", { double: 600_000, triple: 550_000 }),
    ],
    ...changes,
  });

const show = (detail = trip(), me = member({ isOwner: true })) => {
  stubApi({ "packages.savePriceTable": { data: null } });
  renderScreen(<PricesCard detail={detail} />, { width: "wide", me });
};
const cell = (room: string, season: string) => screen.getByRole("textbox", { name: `${room}, ${season}` });
const save = () => screen.getByRole("button", { name: words.save });

describe("the price table", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-11-20T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has a row per room type and a column per season, with its dates", () => {
    show();
    const table = within(screen.getByRole("table"));
    expect(
      table
        .getAllByRole("columnheader")
        .slice(0, 3)
        .map((header) => header.textContent),
    ).toEqual([
      expect.stringContaining(words.roomType),
      expect.stringContaining("Regular"),
      expect.stringContaining("Christmas"),
    ]);
    // The open column never shows its end of time: "all other days".
    expect(table.getByRole("columnheader", { name: new RegExp(words.allOtherDays) })).toBeTruthy();
    expect(table.queryByText(/2099/)).toBeNull();
    expect(table.getByRole("columnheader", { name: /18 Dec.*1 Jan/ })).toBeTruthy();
    expect(table.getByRole("rowheader", { name: "Double" })).toBeTruthy();
    expect(table.getByRole("rowheader", { name: "Triple" })).toBeTruthy();
    expect(cell("Double", "Regular")).toHaveValue("6,000");
  });

  it("typing a price and saving sends one table with both Regular pieces in one column", async () => {
    show();
    const regular = cell("Double", "Regular");
    await userEvent.clear(regular);
    await userEvent.type(regular, "7200");
    await userEvent.click(save());
    expect(inputsTo("packages.savePriceTable")).toEqual([
      {
        packageId: trip().id,
        roomTypes: ["double", "triple"],
        columns: [
          {
            seasonIds: [regularA, regularB],
            label: "Regular",
            prices: { ...noPrices, double: 720_000, triple: 550_000 },
          },
          { seasonIds: [christmas], label: "Christmas", prices: { ...noPrices, double: 900_000, triple: 850_000 } },
        ],
      },
    ]);
  });

  it("a blank cell reads Not sold", async () => {
    show();
    const triple = cell("Triple", "Christmas");
    await userEvent.clear(triple);
    expect(triple).toHaveAttribute("placeholder", words.notSold);
    await userEvent.click(save());
    const sent = inputsTo("packages.savePriceTable")[0] as { columns: { label: string; prices: unknown }[] };
    expect(sent.columns[1]?.prices).toEqual({ ...noPrices, double: 900_000 });
  });

  it("offers only the room types not shown yet, and a new row is saved with the table", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: words.addRoom }));
    expect(screen.queryByRole("menuitem", { name: "Double" })).toBeNull();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Single" }));
    expect(screen.getByRole("rowheader", { name: "Single" })).toBeTruthy();
    await userEvent.type(cell("Single", "Regular"), "5000");
    await userEvent.click(save());
    const sent = inputsTo("packages.savePriceTable")[0] as { roomTypes: string[]; columns: { prices: unknown }[] };
    expect(sent.roomTypes).toEqual(["double", "triple", "single"]);
    expect(sent.columns[0]?.prices).toEqual({ ...noPrices, double: 600_000, triple: 550_000, single: 500_000 });
  });

  it("removing a row takes the room type out of every season", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Remove Triple" }));
    expect(screen.queryByRole("rowheader", { name: "Triple" })).toBeNull();
    await userEvent.click(save());
    const sent = inputsTo("packages.savePriceTable")[0] as { roomTypes: string[]; columns: { prices: unknown }[] };
    expect(sent.roomTypes).toEqual(["double"]);
    expect(sent.columns.map((column) => column.prices)).toEqual([
      { ...noPrices, double: 600_000 },
      { ...noPrices, double: 900_000 },
    ]);
  });

  it("keeps Save off until something changed", async () => {
    show();
    expect(save()).toBeDisabled();
    await userEvent.type(cell("Double", "Regular"), "0");
    expect(save()).toBeEnabled();
  });

  it("locks Add season and the season menus while edits are not saved, and Undo changes brings them back", async () => {
    show();
    await userEvent.type(cell("Double", "Regular"), "0");
    expect(screen.getByRole("button", { name: words.addSeason })).toBeDisabled();
    expect(screen.getByRole("button", { name: words.seasonMenu.replace("{season}", "Christmas") })).toBeDisabled();
    expect(screen.getAllByText(words.unsavedHint).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: words.undo }));
    expect(cell("Double", "Regular")).toHaveValue("6,000");
    expect(screen.getByRole("button", { name: words.addSeason })).toBeEnabled();
    expect(save()).toBeDisabled();
  });

  it("asks for a price in every season before sending, naming the season", async () => {
    show();
    await userEvent.clear(cell("Double", "Christmas"));
    await userEvent.clear(cell("Triple", "Christmas"));
    await userEvent.click(save());
    expect(await screen.findByText(words.problems.noPrice.replace("{season}", "Christmas"))).toBeTruthy();
    expect(inputsTo("packages.savePriceTable")).toEqual([]);
  });

  it("is only to read without quotes:edit", () => {
    show(trip(), member({ permissions: ["quotes:view"] }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: words.save })).toBeNull();
    expect(screen.queryByRole("button", { name: words.addSeason })).toBeNull();
    expect(screen.getByRole("cell", { name: "₹6,000" })).toBeTruthy();
  });
});
