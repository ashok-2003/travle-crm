// A group trip's prices on a phone: a tab per season, its dates on one line, a full-width price per room type.
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

const trip = () =>
  aPackage({
    kind: "group",
    roomTypes: ["double", "triple", "quad"],
    seasons: [
      aSeason(regularA, "Regular", "2027-01-01", "2027-12-17", { double: 600_000, triple: 550_000 }),
      aSeason(christmas, "Christmas", "2027-12-18", "2028-01-01", { double: 900_000, triple: 850_000 }),
      aSeason(regularB, "Regular", "2028-01-02", "2099-12-31", { double: 600_000, triple: 550_000 }),
    ],
  });

const show = (width: "phone" | "wide" = "phone", me = member({ isOwner: true })) => {
  stubApi({ "packages.savePriceTable": { data: null } });
  renderScreen(<PricesCard detail={trip()} />, { width, me });
};
const field = (room: string, season: string) => screen.getByRole("textbox", { name: `${room}, ${season}` });
const tab = (name: string) => screen.getByRole("tab", { name });

describe("the price table on a phone", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-11-20T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a tab per season, its dates on one line and a price field per room type", () => {
    show();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual(["Regular", "Christmas"]);
    const panel = within(screen.getByRole("tabpanel"));
    expect(panel.getByText(messages.packages.departuresCalendar.seasonOpen)).toBeTruthy();
    expect(field("Double", "Regular")).toHaveValue("6,000");
    expect(field("Quad", "Regular")).toHaveValue("");
    expect(field("Quad", "Regular")).toHaveAttribute("placeholder", words.notSold);
    expect(tab("Christmas")).toHaveClass("text-(--brand-avatar-amber-ink)");
    expect(screen.getByRole("tabpanel")).toHaveClass("bg-(--brand-avatar-sage-fill)");
  });

  it("tints the selected tab in its season's fill and ink", async () => {
    show();
    await userEvent.click(tab("Christmas"));
    expect(tab("Christmas")).toHaveAttribute("data-state", "active");
    expect(tab("Christmas")).toHaveClass(
      "data-active:bg-(--brand-avatar-amber-fill)",
      "data-active:text-(--brand-avatar-amber-ink)",
    );
    expect(screen.getByRole("tabpanel")).toHaveClass("bg-(--brand-avatar-amber-fill)");
  });

  it("removes a room type from every season with its button", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Remove Quad" }));
    expect(screen.queryByRole("textbox", { name: "Quad, Regular" })).toBeNull();
    await userEvent.click(tab("Christmas"));
    expect(screen.queryByRole("textbox", { name: "Quad, Christmas" })).toBeNull();
    expect(field("Triple", "Christmas")).toBeTruthy();
  });

  it("keeps a typed price across seasons, and Save sends what the table sends", async () => {
    show();
    await userEvent.click(tab("Christmas"));
    const typed = field("Quad", "Christmas");
    await userEvent.type(typed, "9500");
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/18 Dec.*1 Jan/);
    await userEvent.click(tab("Regular"));
    await userEvent.click(tab("Christmas"));
    expect(field("Quad", "Christmas")).toHaveValue("9,500");
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    expect(inputsTo("packages.savePriceTable")).toEqual([
      {
        packageId: trip().id,
        roomTypes: ["double", "triple", "quad"],
        columns: [
          {
            seasonIds: [regularA, regularB],
            label: "Regular",
            prices: { ...noPrices, double: 600_000, triple: 550_000 },
          },
          {
            seasonIds: [christmas],
            label: "Christmas",
            prices: { ...noPrices, double: 900_000, triple: 850_000, quad: 950_000 },
          },
        ],
      },
    ]);
  });

  it("has the season's menu in its panel, off while there are unsaved edits", async () => {
    show();
    const menu = () => within(screen.getByRole("tabpanel")).getByRole("button", { name: "Options for Regular" });
    expect(menu()).toBeEnabled();
    await userEvent.type(field("Quad", "Regular"), "5000");
    expect(menu()).toBeDisabled();
  });

  it("is only to read without quotes:edit", () => {
    show("phone", member({ permissions: ["quotes:view"] }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Options for/ })).toBeNull();
    expect(within(screen.getByRole("tabpanel")).getAllByText(words.notSold)).toHaveLength(1);
  });

  it("is still the table on a wide screen", () => {
    show("wide");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
