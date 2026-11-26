// Trip details' read view on the trip page: Name, Destination, Nights and Where it starts stay rows; the days are boxes,
// and inclusions, exclusions, pickup points, notes and cancellation notes are lists, every line whole.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { TripDetailsSection } from "@/packages/section-trip-details";
import { renderScreen } from "../leads/screen";
import { aPackage } from "./detail";

const words = messages.packages.form;
const trip = aPackage({
  kind: "group",
  name: "Spiti 8 days",
  destinationName: "Spiti",
  nights: 7,
  startCity: "Delhi",
  days: [
    { title: "Delhi to Shimla and Sangla", description: "Drive through the hills." },
    { title: "Sangla to Kalpa", description: "" },
  ],
  inclusions: "Breakfast and dinner\nTempo traveller",
  exclusions: "Flights\nPersonal expenses",
  pickupPoints: "Delhi ISBT, 6 pm\nChandigarh, 11 pm",
  notes: "Carry warm clothes",
  cancellationNotes: "Free until 30 days before\n50% after",
});

describe("Trip details' read view", () => {
  it("keeps Name, Destination, Nights and Where it starts as rows", () => {
    renderScreen(<TripDetailsSection detail={trip} />, { width: "wide" });
    for (const [label, value] of [
      [words.name, "Spiti 8 days"],
      [words.destination, "Spiti"],
      [words.nights, "7"],
      [words.startCity, "Delhi"],
    ] as const) {
      const row = screen.getByText(label, { selector: "[data-slot=item-description]" }).closest("[data-slot=item]");
      expect(within(row as HTMLElement).getByText(value)).toBeTruthy();
    }
  });

  it("shows the days as boxes with their words, not one squeezed line", () => {
    renderScreen(<TripDetailsSection detail={trip} />, { width: "wide" });
    expect(screen.getByText("Day 1 · Delhi to Shimla and Sangla")).toBeTruthy();
    expect(screen.getByText("Drive through the hills.")).toBeTruthy();
    expect(screen.getByText("Day 2 · Sangla to Kalpa")).toBeTruthy();
    expect(document.querySelectorAll("[data-slot=day-arrow]")).toHaveLength(1);
  });

  it("lists inclusions ticked, exclusions crossed and the rest as points, every line whole", () => {
    renderScreen(<TripDetailsSection detail={trip} />, { width: "wide" });
    expect(document.querySelectorAll("[data-mark=tick]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-mark=cross]")).toHaveLength(2);
    for (const line of [
      "Breakfast and dinner",
      "Tempo traveller",
      "Flights",
      "Personal expenses",
      "Delhi ISBT, 6 pm",
      "Chandigarh, 11 pm",
      "Carry warm clothes",
      "Free until 30 days before",
      "50% after",
    ]) {
      expect(screen.getByText(line).closest("li")).not.toBeNull();
    }
    for (const label of [
      words.inclusions,
      words.exclusions,
      words.pickupPoints,
      words.notes,
      words.cancellationNotes,
    ]) {
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
    }
  });

  it("says a part is not set when it is empty", () => {
    renderScreen(<TripDetailsSection detail={aPackage({ days: [], inclusions: "" })} />, { width: "wide" });
    expect(screen.queryByText(/Day 1/)).toBeNull();
    expect(screen.getAllByText(messages.packages.sections.notSet).length).toBeGreaterThan(0);
  });
});
