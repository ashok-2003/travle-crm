// A trip's page, top to bottom: the status line, Prices, Departures, Trip details, Page and AI, and More (closed).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PackageDetail, QuotePackage } from "@travel-crm/contracts/quotes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackageScreen } from "@/packages/package-screen";
import { messages } from "@/i18n/messages";
import { inputsTo, lastInputTo, renderScreen } from "../leads/screen";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aDeparture, aPackage, aSeason } from "./detail";

const words = messages.packages;
const titles = {
  prices: words.sections.prices.title,
  departures: words.sections.departures.title,
  details: words.sections.details.title,
  page: words.sections.page.title,
  more: words.sections.more.title,
};
const editNamed = (section: string) => words.sections.editNamed.replace("{section}", section);

const groupTrip = aPackage({
  kind: "group",
  sellable: true,
  published: true,
  fromPricePaise: 599_900,
  priceDisplay: "from",
  roomTypes: ["double"],
  seasons: [
    aSeason("0190a000-0000-7000-8000-0000000000a1", "Regular", "2027-01-01", "2099-12-31", { double: 599_900 }),
  ],
  startCity: "Delhi",
  days: [
    { title: "Reach Delhi", description: "" },
    { title: "Drive to Haridwar", description: "" },
  ],
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
  aiSells: detail.sellable && detail.sellGaps.length === 0,
  aiGap: detail.sellGaps[0] ?? null,
  departuresAhead,
  nextDeparture: null,
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
const headings = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

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

  it("shows the status line and the sections in order", async () => {
    await showing(groupTrip);
    expect(screen.getByText(words.header.aiSells)).toBeTruthy();
    expect(screen.getByText(words.header.pageLive)).toBeTruthy();
    expect(await screen.findByText("From ₹5,999 · Next departure 26 Nov · 24 departures ahead")).toBeTruthy();
    const shown = headings().filter((text) => Object.values(titles).includes(text));
    expect(shown).toEqual([titles.prices, titles.departures, titles.details, titles.page, titles.more]);
    // The side index leads to each of them.
    const index = within(screen.getByRole("navigation", { name: words.page.index }));
    expect(index.getByRole("link", { name: titles.details }).getAttribute("href")).toBe("#trip-details");
  });

  it("keeps More closed until it is opened", async () => {
    await showing(groupTrip);
    expect(screen.queryByLabelText(words.form.slug)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: titles.more }));
    expect(await screen.findByLabelText(words.form.slug)).toBeTruthy();
    expect(screen.getByLabelText(words.form.title)).toBeTruthy();
  });

  it("a group trip shows its price table and no From price or tiers", async () => {
    await showing(groupTrip);
    const prices = section(titles.prices);
    expect(prices.getByRole("table")).toBeTruthy();
    expect(prices.getByRole("button", { name: words.prices.addSeason })).toBeTruthy();
    expect(screen.queryByRole("region", { name: words.tiers.title })).toBeNull();
    expect(screen.queryByLabelText(words.form.fromPrice)).toBeNull();
    expect(screen.getByRole("region", { name: titles.departures })).toBeTruthy();
  });

  it("a custom trip shows its From price and tiers, and no table or departures", async () => {
    await showing(aPackage({ kind: "custom", fromPricePaise: 1_250_000 }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("region", { name: titles.departures })).toBeNull();
    const prices = section(titles.prices);
    expect(prices.getByText("₹12,500")).toBeTruthy();
    expect(screen.getAllByRole("region", { name: words.tiers.title })).toHaveLength(1);
  });

  it("the header says why the AI does not sell it, linking to the switch", async () => {
    await showing({ ...groupTrip, sellable: true, sellGaps: ["departures"] });
    const link = screen.getByRole("link", {
      name: words.header.aiDoesNotSellBecause.replace("{reason}", words.sell.reasons.departures),
    });
    const target = document.getElementById((link.getAttribute("href") ?? "").replace("#", ""));
    if (target === null) throw new Error("The link goes nowhere on the page");
    expect(within(target).getByRole("switch", { name: words.sell.label })).toBeTruthy();
  });

  it("Page and AI starts with the sell card, under its heading", async () => {
    await showing(groupTrip);
    const page = within(screen.getByRole("region", { name: titles.page }));
    const sell = page.getByRole("region", { name: words.sell.title });
    const summary = page.getByText(words.form.summary);
    expect(sell.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const heading = screen.getByRole("heading", { level: 2, name: titles.page });
    expect(heading.compareDocumentPosition(sell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("saves the trip's details with only their fields", async () => {
    await showing(groupTrip);
    const details = section(titles.details);
    await userEvent.click(details.getByRole("button", { name: editNamed(titles.details) }));
    const inclusions = details.getByLabelText(words.form.inclusions);
    await userEvent.clear(inclusions);
    await userEvent.type(inclusions, "Hotel stay");
    await userEvent.click(details.getByRole("button", { name: words.sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    const sent = lastInputTo("packages.updatePart") as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      "cancellationNotes",
      "days",
      "destinationId",
      "exclusions",
      "inclusions",
      "name",
      "nights",
      "notes",
      "packageId",
      "pickupPoints",
      "startCity",
    ]);
    expect(sent).toMatchObject({ inclusions: "Hotel stay", startCity: "Delhi" });
  });

  it("Move up on day 2 swaps the first two days, and the ends cannot move out", async () => {
    await showing(groupTrip);
    const details = section(titles.details);
    await userEvent.click(details.getByRole("button", { name: editNamed(titles.details) }));
    expect(details.getByRole("button", { name: words.form.moveUp.replace("{day}", "1") })).toBeDisabled();
    expect(details.getByRole("button", { name: words.form.moveDown.replace("{day}", "2") })).toBeDisabled();
    await userEvent.click(details.getByRole("button", { name: words.form.moveUp.replace("{day}", "2") }));
    await userEvent.click(details.getByRole("button", { name: words.sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    expect((lastInputTo("packages.updatePart") as { days: { title: string }[] }).days.map((day) => day.title)).toEqual([
      "Drive to Haridwar",
      "Reach Delhi",
    ]);
  });

  it("a saved section closes and its summary shows what was saved, read again", async () => {
    const api = await showing(groupTrip);
    const save = heldAnswer({ data: null });
    api.answer("packages.updatePart", save.answer);
    const details = section(titles.details);
    await userEvent.click(details.getByRole("button", { name: editNamed(titles.details) }));
    const inclusions = details.getByLabelText(words.form.inclusions);
    await userEvent.clear(inclusions);
    await userEvent.type(inclusions, "Helicopter ride");
    await userEvent.click(details.getByRole("button", { name: words.sections.save }));
    expect(await details.findByRole("button", { name: words.sections.saving })).toBeTruthy();
    api.answer("packages.get", { data: { ...groupTrip, inclusions: "Helicopter ride" } });
    save.release();
    await waitFor(() => {
      expect(details.queryByLabelText(words.form.inclusions)).toBeNull();
    });
    expect(details.getByText("Helicopter ride")).toBeTruthy();
  });

  it("Cancel leaves the section unchanged", async () => {
    await showing(groupTrip);
    const details = section(titles.details);
    await userEvent.click(details.getByRole("button", { name: editNamed(titles.details) }));
    await userEvent.type(details.getByLabelText(words.form.inclusions), " and more");
    await userEvent.click(details.getByRole("button", { name: words.sections.cancel }));
    expect(details.queryByLabelText(words.form.inclusions)).toBeNull();
    expect(inputsTo("packages.updatePart")).toEqual([]);
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
    landsOn("advance", titles.departures);
    landsOn("departures", titles.departures);
    landsOn("from_price", titles.page);
  });

  it("a member without quotes:edit sees no Edit buttons", async () => {
    await showing(groupTrip, member({ permissions: ["quotes:view"] }));
    for (const title of [titles.details, titles.page]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
      expect(screen.queryByRole("button", { name: editNamed(title) })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: words.prices.addSeason })).toBeNull();
    expect(screen.queryByRole("button", { name: words.copyNote.open })).toBeNull();
  });

  it("Trip details offers to copy a line to other trips", async () => {
    await showing(groupTrip);
    expect(section(titles.details).getByRole("button", { name: words.copyNote.open })).toBeTruthy();
  });
});
