// The repeats line under the calendar: the weekly rule in plain words with Change and Stop, and the seats and the
// advance each changeable in place.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RepeatsLine } from "@/packages/repeats-line";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";
import { answerNext, detail } from "./departures-support";

function show(changes: Partial<typeof detail> = {}) {
  screenIs("wide");
  const api = fakeApi();
  renderWithApi(<RepeatsLine detail={{ ...detail, ...changes }} />, newQueryClient(), member({ isOwner: true }));
  return api;
}

describe("RepeatsLine", () => {
  it("says the weekly rule in words, months starting after the longest gap", () => {
    show();
    expect(screen.getByText("Every Friday in Nov, Dec and Jan · new departures appear 12 weeks ahead")).toBeTruthy();
    expect(screen.getByText("Seats on each new departure: 40")).toBeTruthy();
    expect(screen.getByText("Advance to hold a seat: ₹2,000")).toBeTruthy();
  });

  it("with no weekly days says departures are added one day at a time, and offers no Stop", () => {
    show({ weeklyDays: [] });
    expect(screen.getByText(/No weekly repeats/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });

  it("Stop clears the weekly days after a confirmation", async () => {
    const api = show();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stop repeating" }));
    expect(await answerNext(api, "packages.updatePart", {})).toEqual({ packageId: detail.id, weeklyDays: [] });
  });

  it("Change picks the weekdays and months and saves them", async () => {
    const api = show();
    await userEvent.click(screen.getByRole("button", { name: "Change the weekly departures" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sun" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Feb" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await answerNext(api, "packages.updatePart", {})).toEqual({
      packageId: detail.id,
      weeklyDays: [0, 5],
      departureMonths: [1, 2, 11, 12],
    });
  });

  it("changes the seats on each new departure in place", async () => {
    const api = show();
    await userEvent.click(screen.getByRole("button", { name: "Change the seats on each new departure" }));
    const box = screen.getByLabelText("Seats on each new departure");
    await userEvent.clear(box);
    await userEvent.type(box, "30");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await answerNext(api, "packages.updatePart", {})).toEqual({ packageId: detail.id, seatsPerDeparture: 30 });
  });

  it("changes the advance in place, in rupees", async () => {
    const api = show();
    await userEvent.click(screen.getByRole("button", { name: "Change the advance to hold a seat" }));
    const box = screen.getByLabelText("Advance to hold a seat, in rupees");
    await userEvent.clear(box);
    await userEvent.type(box, "2500");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await answerNext(api, "packages.updatePart", {})).toEqual({
      packageId: detail.id,
      advancePerPersonPaise: 250000,
    });
  });
});
