// A group package's seasons: each with the price of every room type it sells, and the dialog that adds or changes one.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SeasonsCard } from "@/packages/seasons-card";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aPackage } from "./detail";

const words = messages.packages;
const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const peak = {
  id: "0190a000-0000-7000-8000-0000000000a1",
  label: "Peak",
  startsOn: "2026-10-01",
  endsOn: "2026-12-15",
  prices: { ...none, double: 1250000, triple: 1100000 },
};
const group = (seasons = [peak]) => aPackage({ kind: "group", roomTypes: ["double", "triple"], seasons });

describe("SeasonsCard", () => {
  beforeEach(() => {
    screenIs("wide");
  });

  it("lists seasons with each offered room's price", () => {
    renderWithApi(<SeasonsCard detail={group()} />, newQueryClient());
    const row = screen.getByRole("row", { name: /Peak/ });
    expect(within(row).getByText(/1 Oct to 15 Dec/)).toBeTruthy();
    expect(within(row).getByText(/Double/)).toBeTruthy();
    expect(within(row).getByText(/₹12,500/)).toBeTruthy();
    expect(within(row).getByText(/₹11,000/)).toBeTruthy();
    expect(within(row).queryByText(/Single/)).toBeNull();
  });

  it("an overlap shows its sentence on the dates", async () => {
    const api = fakeApi();
    renderWithApi(<SeasonsCard detail={group([])} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: words.seasons.add }));
    await userEvent.type(screen.getByRole("textbox", { name: words.season.label }), "Peak");
    await userEvent.type(screen.getByRole("textbox", { name: words.season.startsOn }), "01/10/2027");
    await userEvent.type(screen.getByRole("textbox", { name: words.season.endsOn }), "15/12/2027");
    await userEvent.type(screen.getByRole("textbox", { name: "Double, per person" }), "12500");
    await userEvent.click(screen.getByRole("button", { name: words.season.save }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(api.last().path).toBe("packages.saveSeason");
    expect(api.last().input).toEqual({
      packageId: aPackage().id,
      label: "Peak",
      startsOn: "2027-10-01",
      endsOn: "2027-12-15",
      prices: { ...none, double: 1250000 },
    });
    api.last().refuse(409, "PACKAGE_SEASON_OVERLAPS");
    const sentence = await screen.findByText(messages.errors.reasons.PACKAGE_SEASON_OVERLAPS);
    const dates = screen.getByRole("textbox", { name: words.season.startsOn });
    expect(dates.getAttribute("aria-describedby")).toContain(sentence.id);
  });

  it("asks for a price before sending", async () => {
    const api = fakeApi();
    renderWithApi(<SeasonsCard detail={group([])} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: words.seasons.add }));
    await userEvent.type(screen.getByRole("textbox", { name: words.season.label }), "Peak");
    await userEvent.type(screen.getByRole("textbox", { name: words.season.startsOn }), "01/10/2027");
    await userEvent.type(screen.getByRole("textbox", { name: words.season.endsOn }), "15/12/2027");
    await userEvent.click(screen.getByRole("button", { name: words.season.save }));
    expect(await screen.findByText(words.season.problems.noPrice)).toBeTruthy();
    expect(api.calls).toHaveLength(0);
  });

  it("words the prices by the package's GST switch", async () => {
    const { unmount } = renderWithApi(<SeasonsCard detail={group([])} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: words.seasons.add }));
    expect(await screen.findByText(/each room type sold, including GST\./)).toBeTruthy();
    unmount();
    renderWithApi(
      <SeasonsCard detail={aPackage({ kind: "group", roomTypes: ["double"], pricesIncludeGst: false })} />,
      newQueryClient(),
    );
    await userEvent.click(screen.getByRole("button", { name: words.seasons.add }));
    expect(await screen.findByText(/each room type sold, before GST\./)).toBeTruthy();
  });
});
