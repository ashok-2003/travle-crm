// The departures calendar: each departure's day in its season's colour with its lowest price and seats, a legend,
// months by arrows; a wide screen shows two months, a phone one, and both a compact day.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeparturesCard } from "@/packages/departures-card";
import { seasonTint } from "@/packages/season-colours";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";
import { answerNext, calendarDeparture, detail, fakeBatchApi } from "./departures-support";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const day = (text: RegExp) => screen.getByRole("button", { name: text });

async function show(width: "phone" | "wide") {
  screenIs(width);
  const api = fakeBatchApi();
  renderWithApi(<DeparturesCard detail={detail} />, newQueryClient(), member({ isOwner: true }));
  const input = await answerNext(api, "departures.calendar", [
    calendarDeparture("2026-11-27"),
    calendarDeparture("2026-11-29", { departureId: "0190a000-0000-7000-8000-0000000000d2", status: "cancelled" }),
    calendarDeparture("2026-11-30", {
      departureId: "0190a000-0000-7000-8000-0000000000d3",
      seatsFree: 0,
      seatsSold: 40,
    }),
    calendarDeparture("2026-11-21", { departureId: "0190a000-0000-7000-8000-0000000000d5" }),
    calendarDeparture("2026-11-03", {
      departureId: "0190a000-0000-7000-8000-0000000000d4",
      prices: { ...none },
      priceSource: "none",
      seasonLabel: null,
    }),
  ]);
  // A wide screen reads the next month too.
  if (width === "wide") await answerNext(api, "departures.calendar", [calendarDeparture("2026-12-04")]);
  return { api, input };
}

describe("DeparturesCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T05:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the month's days from the api", async () => {
    const { api, input } = await show("wide");
    expect(input).toEqual({ packageId: detail.id, from: "2026-11-01", to: "2026-11-30" });
    expect(api.calls.map((call) => call.input)).toContainEqual({
      packageId: detail.id,
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("reads one month on a phone", async () => {
    const { api } = await show("phone");
    expect(api.calls.filter((call) => call.path === "departures.calendar")).toHaveLength(1);
  });

  it("shows a departure's lowest price and seats, and marks cancelled and full days", async () => {
    await show("wide");
    const open = await screen.findByRole("button", { name: /^27 Nov, departure/ });
    expect(within(open).getByText("₹5,999")).toBeTruthy();
    expect(within(open).getByText("32 left")).toBeTruthy();
    expect(within(day(/^29 Nov/)).getByText("Cancelled")).toBeTruthy();
    expect(within(day(/^30 Nov/)).getByText("Full")).toBeTruthy();
  });

  it("shows no price on a day no season covers, or on a day with no departure", async () => {
    await show("wide");
    const uncovered = await screen.findByRole("button", { name: /^3 Nov, departure/ });
    expect(within(uncovered).queryByText(/₹/)).toBeNull();
    expect(within(day(/^12 Nov/)).queryByText(/₹/)).toBeNull();
  });

  it("colours only a departure's day, by its season, and the legend lists each season with the same colour", async () => {
    await show("wide");
    const regularDay = (await screen.findByRole("button", { name: /^27 Nov, departure/ })).closest("td");
    expect(regularDay?.className).toContain(seasonTint(0).fill);
    expect(day(/^21 Nov/).closest("td")?.className).toContain(seasonTint(1).fill);
    // A day with no departure stays plain, in a season or not; a departure no season prices is still marked.
    expect(day(/^26 Nov/).closest("td")?.className).not.toContain(seasonTint(0).fill);
    expect(day(/^22 Nov/).closest("td")?.className).not.toContain(seasonTint(1).fill);
    // A departure in no season has no fill at all, and says "No price".
    for (const tint of [0, 1].map(seasonTint)) expect(day(/^3 Nov/).closest("td")?.className).not.toContain(tint.fill);
    expect(day(/^3 Nov/).closest("td")?.className).not.toContain("bg-muted");
    const legend = screen.getByRole("list", { name: "Seasons" });
    const items = within(legend).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Regular, all other days");
    expect(items[0]?.innerHTML).toContain(seasonTint(0).fill);
    expect(items[1]?.textContent).toContain("Diwali, 20 Nov to 22 Nov");
    expect(items[1]?.innerHTML).toContain(seasonTint(1).fill);
    expect(legend.textContent).not.toContain("2099");
  });

  it("shows two months side by side with the day's panel under them, and the arrows move by one month", async () => {
    const { api } = await show("wide");
    expect(await screen.findAllByRole("grid")).toHaveLength(2);
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.getByText("December 2026")).toBeTruthy();
    const december = await screen.findByRole("button", { name: /^4 Dec, departure/ });
    expect(within(december).getByText("32 left")).toBeTruthy();
    await userEvent.click(december);
    const panel = await screen.findByRole("heading", { name: "Fri 4 Dec" });
    const grids = screen.getAllByRole("grid");
    expect(grids.every((grid) => grid.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() => {
      expect(api.calls.map((call) => call.input)).toContainEqual({
        packageId: detail.id,
        from: "2027-01-01",
        to: "2027-01-31",
      });
    });
    expect(screen.getByText("January 2027")).toBeTruthy();
  });

  describe("on a phone", () => {
    it("shows the month as a grid of days, not a list", async () => {
      await show("phone");
      expect(await screen.findByRole("grid")).toBeTruthy();
      expect(screen.queryByRole("list", { name: /^Departures in/ })).toBeNull();
      expect(screen.getAllByRole("grid")).toHaveLength(1);
    });

    it("reads a day's date, price and seats; few seats in bold", async () => {
      await show("phone");
      const open = await screen.findByRole("button", { name: /^27 Nov, departure/ });
      expect(open.textContent).toContain("27");
      expect(open.textContent).toContain("5,999");
      expect(within(open).getByText("32 left").className).not.toContain("font-bold");
      expect(open.getAttribute("aria-label")).toBe("27 Nov, departure, from ₹5,999, 32 left");
    });

    it("bolds 5 or fewer seats left", async () => {
      screenIs("phone");
      const api = fakeBatchApi();
      renderWithApi(<DeparturesCard detail={detail} />, newQueryClient(), member({ isOwner: true }));
      await answerNext(api, "departures.calendar", [
        calendarDeparture("2026-11-27", { seatsFree: 5, seatsSold: 35 }),
        calendarDeparture("2026-11-28", { departureId: "0190a000-0000-7000-8000-0000000000d6", seatsFree: 6 }),
      ]);
      expect((await screen.findByText("5 left")).className).toContain("font-bold");
      expect(screen.getByText("6 left").className).not.toContain("font-bold");
    });

    it("strikes the price of a full day and the word on a cancelled one, and says so in their names", async () => {
      await show("phone");
      const full = await screen.findByRole("button", { name: /^30 Nov, departure/ });
      expect(within(full).getByText("Full")).toBeTruthy();
      expect(within(full).getByText(/5,999/).className).toContain("line-through");
      expect(full.getAttribute("aria-label")).toBe("30 Nov, departure, full, from ₹5,999");
      const cancelled = day(/^29 Nov, departure/);
      expect(within(cancelled).getByText("Cancelled").className).toContain("line-through");
      expect(cancelled.getAttribute("aria-label")).toBe("29 Nov, departure cancelled");
    });

    it("says No price, with no season fill, for a departure no season covers", async () => {
      await show("phone");
      const bare = await screen.findByRole("button", { name: /^3 Nov, departure/ });
      expect(within(bare).getByText("No price")).toBeTruthy();
      expect(bare.getAttribute("aria-label")).toBe("3 Nov, departure, no price, 32 left");
      expect(bare.closest("td")?.className).not.toContain("bg-(--brand");
    });

    it("opens the sheet on a departure's panel, and on an empty day to add one", async () => {
      await show("phone");
      await userEvent.click(await screen.findByRole("button", { name: /^27 Nov, departure/ }));
      const sheet = await screen.findByRole("dialog");
      expect(await within(sheet).findByText("Open departure", { exact: false })).toBeTruthy();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      await userEvent.click(day(/^28 Nov/));
      const empty = await screen.findByRole("dialog");
      expect(await within(empty).findByText("Add a departure on Sat 28 Nov")).toBeTruthy();
    });
  });
});
