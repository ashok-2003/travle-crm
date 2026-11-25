// Add season (above the price table) and a column's Change dates and Rename.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { PricesCard } from "@/packages/prices-card";
import { inputsTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { aPackage, aSeason, noPrices } from "./detail";

const words = messages.packages.prices;
const season = messages.packages.season;
const regularA = "0190a000-0000-7000-8000-0000000000a1";
const christmas = "0190a000-0000-7000-8000-0000000000a2";
const regularB = "0190a000-0000-7000-8000-0000000000a3";
const trip = aPackage({
  kind: "group",
  roomTypes: ["double"],
  seasons: [
    aSeason(regularA, "Regular", "2027-01-01", "2027-12-17", { double: 720_000 }),
    aSeason(christmas, "Christmas", "2027-12-18", "2028-01-01", { double: 900_000 }),
    aSeason(regularB, "Regular", "2028-01-02", "2099-12-31", { double: 720_000 }),
  ],
});

function show() {
  const api = stubApi({
    "packages.saveSpecialPrices": { data: null },
    "packages.saveSeason": { data: null },
    "packages.removeSeason": { data: null },
  });
  renderScreen(<PricesCard detail={trip} />, { width: "wide" });
  return api;
}
const menuOf = async (name: string, item: string) => {
  await userEvent.click(screen.getByRole("button", { name: words.seasonMenu.replace("{season}", name) }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
  return await screen.findByRole("dialog");
};

describe("Add season", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-11-20T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sits above the table", () => {
    show();
    const add = screen.getByRole("button", { name: words.addSeason });
    const table = screen.getByRole("table");
    expect(add.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("starts with the prices of the first column", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: words.addSeason }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Double, per person" })).toHaveValue("7,200");
  });

  it("until I change it sends no end date", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: words.addSeason }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: season.label }), "Diwali");
    await userEvent.type(within(dialog).getByRole("textbox", { name: season.startsOn }), "01/03/2028");
    await userEvent.click(within(dialog).getByRole("switch", { name: season.untilChanged }));
    expect(within(dialog).queryByRole("textbox", { name: season.endsOn })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: season.save }));
    await waitFor(() => {
      expect(inputsTo("packages.saveSpecialPrices")).toHaveLength(1);
    });
    expect(inputsTo("packages.saveSpecialPrices")[0]).toEqual({
      packageId: trip.id,
      label: "Diwali",
      startsOn: "2028-03-01",
      endsOn: null,
      prices: { ...noPrices, double: 720_000 },
    });
  });

  it("with a last day sends it", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: words.addSeason }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: season.label }), "Diwali");
    await userEvent.type(within(dialog).getByRole("textbox", { name: season.startsOn }), "01/03/2028");
    await userEvent.type(within(dialog).getByRole("textbox", { name: season.endsOn }), "07/03/2028");
    await userEvent.click(within(dialog).getByRole("button", { name: season.save }));
    await waitFor(() => {
      expect(inputsTo("packages.saveSpecialPrices")).toHaveLength(1);
    });
    expect(inputsTo("packages.saveSpecialPrices")[0]).toMatchObject({ startsOn: "2028-03-01", endsOn: "2028-03-07" });
  });
});

describe("Change dates", () => {
  it("offers No end date on the open column, already on", async () => {
    show();
    const dialog = await menuOf("Regular", words.changeDates);
    expect(within(dialog).getByRole("switch", { name: season.noEnd })).toBeChecked();
  });

  it("offers No end date on a closed last column, and sends the open end", async () => {
    show();
    const dialog = await menuOf("Christmas", words.changeDates);
    const noEnd = within(dialog).getByRole("switch", { name: season.noEnd });
    expect(noEnd).not.toBeChecked();
    await userEvent.click(noEnd);
    await userEvent.click(within(dialog).getByRole("button", { name: season.save }));
    await waitFor(() => {
      expect(inputsTo("packages.saveSeason")).toHaveLength(1);
    });
    expect(inputsTo("packages.saveSeason")[0]).toEqual({
      packageId: trip.id,
      seasonId: christmas,
      label: "Christmas",
      startsOn: "2027-12-18",
      endsOn: "2099-12-31",
      prices: { ...noPrices, double: 900_000 },
    });
  });
});

describe("Rename", () => {
  it("renames every piece of the column", async () => {
    show();
    const dialog = await menuOf("Regular", words.rename);
    const name = within(dialog).getByRole("textbox", { name: season.label });
    await userEvent.clear(name);
    await userEvent.type(name, "Usual");
    await userEvent.click(within(dialog).getByRole("button", { name: season.save }));
    await waitFor(() => {
      expect(inputsTo("packages.saveSeason")).toHaveLength(2);
    });
    expect(inputsTo("packages.saveSeason")).toEqual([
      {
        packageId: trip.id,
        seasonId: regularA,
        label: "Usual",
        startsOn: "2027-01-01",
        endsOn: "2027-12-17",
        prices: { ...noPrices, double: 720_000 },
      },
      {
        packageId: trip.id,
        seasonId: regularB,
        label: "Usual",
        startsOn: "2028-01-02",
        endsOn: "2099-12-31",
        prices: { ...noPrices, double: 720_000 },
      },
    ]);
  });
});

describe("Remove", () => {
  it("removes every piece of the column after asking", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: words.seasonMenu.replace("{season}", "Regular") }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.remove }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: words.remove }));
    await waitFor(() => {
      expect(inputsTo("packages.removeSeason")).toHaveLength(2);
    });
    expect(inputsTo("packages.removeSeason")).toEqual([{ seasonId: regularA }, { seasonId: regularB }]);
  });
});
