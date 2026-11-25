// A trip's page: a status line, then four sections, each a short summary with Edit, which saves that section alone.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PackageDetail, QuotePackage } from "@travel-crm/contracts/quotes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackageScreen } from "@/packages/package-screen";
import { messages } from "@/i18n/messages";
import { inputsTo, lastInputTo, renderScreen } from "../leads/screen";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aDeparture, aPackage } from "./detail";

const words = messages.packages;
const titles = {
  prices: words.sections.prices.title,
  itinerary: words.sections.itinerary.title,
  details: words.sections.details.title,
  page: words.sections.page.title,
};
const editNamed = (section: string) => words.sections.editNamed.replace("{section}", section);

const groupTrip = aPackage({
  kind: "group",
  sellable: true,
  published: true,
  fromPricePaise: 599_900,
  priceDisplay: "from",
  roomTypes: ["double"],
  weeklyDays: [5, 6],
  startCity: "Delhi",
  inclusions: "Hotel stay\nBreakfast",
  summary: "Six days to the temple and back.",
});

/** The trip as the Packages list shows it, with its dates ahead. */
const listed = (detail: PackageDetail, departuresAhead: number): QuotePackage => ({
  id: detail.id,
  name: detail.name,
  title: detail.title,
  days: detail.days.length,
  subtotalPaise: 0,
  taxRateBasisPoints: detail.taxRateBasisPoints,
  published: detail.published,
  slug: detail.slug,
  tierCount: 0,
  kind: detail.kind,
  nights: detail.nights,
  fromPricePaise: detail.fromPricePaise,
  aiSellable: detail.sellable,
  departuresAhead,
});

/** Opens the trip's page over an api that has the trip, its departures and its place in the Packages list. */
async function showing(detail: PackageDetail, me = member({ isOwner: true })) {
  const api = stubApi({
    "packages.get": { data: detail },
    "departures.list": (input) => ({
      data:
        (input as { filter: string }).filter === "upcoming" ? [aDeparture("2027-11-26"), aDeparture("2027-12-03")] : [],
    }),
    "quotes.packages": { data: [listed(detail, 24)] },
    "packages.updatePart": { data: null },
  });
  renderScreen(<PackageScreen packageId={detail.id} />, { width: "wide", me });
  await screen.findByRole("heading", { level: 1, name: detail.name });
  return api;
}

const section = (title: string) => within(screen.getByRole("region", { name: title }));

describe("PackageScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-11-20T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says the page is not live when it is published but the agency's public pages are off", async () => {
    await showing({ ...groupTrip, pagesEnabled: false });
    expect(screen.getByText(words.header.pageNotLive)).toBeTruthy();
    expect(screen.queryByText(words.header.pageLive)).toBeNull();
  });

  it("shows the status line and four section summaries", async () => {
    await showing(groupTrip);
    expect(screen.getByText(words.header.aiSells)).toBeTruthy();
    expect(screen.getByText(words.header.pageLive)).toBeTruthy();
    expect(await screen.findByText("From ₹5,999 · Next departure 26 Nov · 24 dates ahead")).toBeTruthy();
    for (const title of Object.values(titles)) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    }
    expect(section(titles.prices).getByText("Delhi")).toBeTruthy();
    expect(section(titles.prices).getByText(`${words.form.weekdays["5"]}, ${words.form.weekdays["6"]}`)).toBeTruthy();
    expect(section(titles.itinerary).getByText(groupTrip.title)).toBeTruthy();
    expect(section(titles.details).getByText(/Hotel stay/)).toBeTruthy();
    expect(section(titles.page).getByText(groupTrip.summary)).toBeTruthy();
    // The side index leads to each section.
    const index = within(screen.getByRole("navigation", { name: words.page.index }));
    expect(index.getByRole("link", { name: titles.itinerary }).getAttribute("href")).toBe("#itinerary");
  });

  it("editing Itinerary sends updatePart with only the itinerary's fields", async () => {
    await showing(groupTrip);
    const itinerary = section(titles.itinerary);
    await userEvent.click(itinerary.getByRole("button", { name: editNamed(titles.itinerary) }));
    const title = itinerary.getByLabelText(words.form.title);
    await userEvent.clear(title);
    await userEvent.type(title, "Kedarnath by helicopter");
    await userEvent.click(itinerary.getByRole("button", { name: words.sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    const sent = lastInputTo("packages.updatePart") as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["days", "destinationId", "name", "nights", "packageId", "title"]);
    expect(sent).toMatchObject({ packageId: groupTrip.id, title: "Kedarnath by helicopter", nights: 5 });
  });

  it("a saved section closes and its summary shows what was saved, read again", async () => {
    const api = await showing(groupTrip);
    const save = heldAnswer({ data: null });
    api.answer("packages.updatePart", save.answer);
    const itinerary = section(titles.itinerary);
    await userEvent.click(itinerary.getByRole("button", { name: editNamed(titles.itinerary) }));
    const title = itinerary.getByLabelText(words.form.title);
    await userEvent.clear(title);
    await userEvent.type(title, "Kedarnath by helicopter");
    await userEvent.click(itinerary.getByRole("button", { name: words.sections.save }));
    expect(await itinerary.findByRole("button", { name: words.sections.saving })).toBeTruthy();
    // The api has saved it: the trip read again holds the new title.
    api.answer("packages.get", { data: { ...groupTrip, title: "Kedarnath by helicopter" } });
    save.release();
    await waitFor(() => {
      expect(itinerary.queryByLabelText(words.form.title)).toBeNull();
    });
    // Closed only once the trip was read again, so the summary never shows the old title after a save.
    expect(itinerary.getByText("Kedarnath by helicopter")).toBeTruthy();
    expect(itinerary.queryByText(groupTrip.title)).toBeNull();
    expect(itinerary.getByRole("button", { name: editNamed(titles.itinerary) })).toBeTruthy();
  });

  it("Cancel leaves the section unchanged", async () => {
    await showing(groupTrip);
    const itinerary = section(titles.itinerary);
    await userEvent.click(itinerary.getByRole("button", { name: editNamed(titles.itinerary) }));
    await userEvent.type(itinerary.getByLabelText(words.form.title), " by road");
    await userEvent.click(itinerary.getByRole("button", { name: words.sections.cancel }));
    expect(itinerary.getByText(groupTrip.title)).toBeTruthy();
    expect(itinerary.queryByLabelText(words.form.title)).toBeNull();
    expect(inputsTo("packages.updatePart")).toEqual([]);
    await userEvent.click(itinerary.getByRole("button", { name: editNamed(titles.itinerary) }));
    expect(itinerary.getByLabelText(words.form.title)).toHaveValue(groupTrip.title);
  });

  it("each gap link's anchor holds its section's heading", async () => {
    await showing(
      aPackage({ kind: "group", sellGaps: ["room_types", "prices", "advance", "departures", "from_price"] }),
    );
    const sell = within(screen.getByRole("region", { name: words.sell.title }));
    const landsOn = (gap: keyof typeof words.sell.gaps, title: string) => {
      const href = sell.getByRole("link", { name: words.sell.gaps[gap] }).getAttribute("href") ?? "";
      const target = document.getElementById(href.replace("#", ""));
      if (target === null) throw new Error(`Nothing on the page has the id ${href}`);
      expect(within(target).getByRole("heading", { level: 2, name: title })).toBeTruthy();
    };
    landsOn("room_types", titles.prices);
    landsOn("prices", titles.prices);
    landsOn("advance", titles.prices);
    landsOn("departures", titles.prices);
    landsOn("from_price", titles.page);
  });

  it("a custom trip shows no calendar and no departures", async () => {
    await showing(aPackage({ kind: "custom", fromPricePaise: 1_250_000 }));
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByRole("region", { name: words.calendar.title })).toBeNull();
    expect(screen.queryByRole("region", { name: words.packageDepartures.title })).toBeNull();
    expect(screen.queryByRole("region", { name: words.seasons.title })).toBeNull();
    // Its tiers and its From price sit with its prices.
    const prices = section(titles.prices);
    expect(prices.getByRole("region", { name: words.tiers.title })).toBeTruthy();
    expect(prices.getByText("₹12,500")).toBeTruthy();
    expect(screen.getAllByRole("region", { name: words.tiers.title })).toHaveLength(1);
  });

  it("a group trip shows its calendar, seasons and departures with its prices, and its tiers with its page", async () => {
    await showing(groupTrip);
    const prices = section(titles.prices);
    expect(await prices.findByRole("grid")).toBeTruthy();
    expect(prices.getByRole("region", { name: words.seasons.title })).toBeTruthy();
    expect(prices.getByRole("region", { name: words.packageDepartures.title })).toBeTruthy();
    expect(prices.getByRole("button", { name: words.addDates.title })).toBeTruthy();
    expect(prices.getByRole("button", { name: words.seasons.addSpecialPrices })).toBeTruthy();
    expect(section(titles.page).getByRole("region", { name: words.tiers.title })).toBeTruthy();
  });

  it("a member without quotes:edit sees no Edit buttons", async () => {
    await showing(groupTrip, member({ permissions: ["quotes:view"] }));
    for (const title of Object.values(titles)) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
      expect(screen.queryByRole("button", { name: editNamed(title) })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: words.addDates.title })).toBeNull();
    expect(screen.queryByRole("button", { name: words.copyNote.open })).toBeNull();
  });

  it("Details & rules offers to copy a line to other trips", async () => {
    await showing(groupTrip);
    expect(section(titles.details).getByRole("button", { name: words.copyNote.open })).toBeTruthy();
  });
});
