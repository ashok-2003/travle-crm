// The departures calendar: each departure's day in its season's colour with its lowest price and seats, a legend,
// months by arrows, and on a phone the month as a list.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeparturesCard } from "@/packages/departures-card";
import { seasonTint } from "@/packages/season-colours";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";
import { answerNext, calendarDeparture, detail } from "./departures-support";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const day = (text: RegExp) => screen.getByRole("button", { name: text });

async function show(width: "phone" | "wide") {
  screenIs(width);
  const api = fakeApi();
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
    const { input } = await show("wide");
    expect(input).toEqual({ packageId: detail.id, from: "2026-11-01", to: "2026-11-30" });
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
    const uncovered = await screen.findByRole("button", { name: /^3 Nov/ });
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
    expect(day(/^3 Nov/).closest("td")?.className).toContain("bg-muted");
    const legend = screen.getByRole("list", { name: "Seasons" });
    const items = within(legend).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Regular · all other days");
    expect(items[0]?.innerHTML).toContain(seasonTint(0).fill);
    expect(items[1]?.textContent).toContain("Diwali · 20 Nov to 22 Nov");
    expect(items[1]?.innerHTML).toContain(seasonTint(1).fill);
    expect(legend.textContent).not.toContain("2099");
  });

  it("changes month with the arrows and reads that month's days", async () => {
    const { api } = await show("wide");
    await screen.findByRole("button", { name: /^27 Nov, departure/ });
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    const input = await answerNext(api, "departures.calendar", []);
    expect(input).toEqual({ packageId: detail.id, from: "2026-12-01", to: "2026-12-31" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^4 Dec/ })).toBeTruthy();
    });
  });

  it("on a phone lists the month's departures", async () => {
    await show("phone");
    expect(await screen.findByText("Fri 27 Nov · ₹5,999 · 32 of 40 left")).toBeTruthy();
    expect(screen.getByText("Sun 29 Nov · Cancelled")).toBeTruthy();
    expect(screen.queryByRole("grid")).toBeNull();
  });
});
