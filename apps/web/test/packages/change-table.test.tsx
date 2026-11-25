// The change table: a tick, What, Now and New per change; a flagged change in red with its reason and unticked.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangeTable, cleanChangeIds } from "@/packages/ai-changes/change-table";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";
import type { ProposedChange } from "@/packages/ai-changes/use-package-changes-ai";
import { aSeason } from "./detail";
import { flaggedChange, priceChange, seatsChange } from "./ai-changes-support";

const words = messages.packages.aiChanges;
const renderTable = (ticked: string[], onTickedChange = vi.fn()) =>
  renderWithApi(
    <ChangeTable changes={[priceChange, flaggedChange, seatsChange]} ticked={ticked} onTickedChange={onTickedChange} />,
    newQueryClient(),
  );

describe("ChangeTable", () => {
  it("starts with the clean changes ticked and the flagged one not", () => {
    expect(cleanChangeIds([priceChange, flaggedChange, seatsChange])).toEqual(["c1", "c3"]);
  });

  it("shows What, Now and New for a price, a departure and a trip field", () => {
    renderTable(["c1", "c3"]);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      words.columns.apply,
      words.columns.what,
      words.columns.now,
      words.columns.next,
    ]);
    const price = screen.getByRole("row", { name: /Prices for Regular/ });
    expect(within(price).getByText("Double ₹12,000")).toBeInTheDocument();
    expect(within(price).getByText("Double ₹13,000")).toBeInTheDocument();
    const seats = screen.getByRole("row", { name: /Seats on each departure/ });
    expect(within(seats).getByText("12 seats")).toBeInTheDocument();
    expect(within(seats).getByText("15 seats")).toBeInTheDocument();
  });

  it("shows a flagged change in red with its reason, unticked", () => {
    renderTable(["c1"]);
    const row = screen.getByRole("row", { name: /Cancel the departure on Sun 12 Dec/ });
    expect(within(row).getByText(words.flags.has_bookings)).toHaveClass("text-status-bad-ink");
    expect(within(row).getByRole("checkbox")).not.toBeChecked();
    expect(within(screen.getByRole("row", { name: /Prices for Regular/ })).getByRole("checkbox")).toBeChecked();
  });

  it("ticks and unticks, and can't tick what the role may not do", async () => {
    const onTickedChange = vi.fn();
    renderTable(["c1"], onTickedChange);
    await userEvent.click(screen.getByRole("checkbox", { name: "Apply: Seats on each departure" }));
    expect(onTickedChange).toHaveBeenCalledWith(["c1", "c3"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Apply: Prices for Regular" }));
    expect(onTickedChange).toHaveBeenLastCalledWith([]);
  });

  it("names a season by its dates, and says Same when no room differs", () => {
    const sameChange = { ...priceChange, id: "c9", prices: { ...priceChange.prices, double: 1_200_000 } };
    renderWithApi(
      <ChangeTable
        changes={[priceChange, sameChange]}
        ticked={[]}
        onTickedChange={vi.fn()}
        seasons={[aSeason(priceChange.seasonIds[0] ?? "", "Regular", "2027-01-01", "2027-03-31")]}
      />,
      newQueryClient(),
    );
    expect(screen.getAllByText("Prices for Regular (1 Jan 2027 to 31 Mar 2027)")).toHaveLength(2);
    expect(
      within(screen.getByRole("row", { name: /Prices for Regular.*Same.*Same/ })).getAllByText(words.rows.noChange),
    ).toHaveLength(2);
  });

  it("numbers the itinerary's days, adds notes, and words empty repeats", () => {
    const changes: ProposedChange[] = [
      {
        id: "i1",
        kind: "itinerary",
        evidence: [],
        flags: [],
        before: [
          { title: "Delhi", description: "" },
          { title: "Agra", description: "" },
        ],
        days: [
          { title: "Agra", description: "" },
          { title: "Delhi", description: "" },
        ],
      },
      { id: "n1", kind: "note_add", evidence: [], flags: [], line: "Carry ID" },
      { id: "w1", kind: "trip_field", evidence: [], flags: [], field: "weeklyDays", before: [], value: [5, 1] },
      { id: "m1", kind: "trip_field", evidence: [], flags: [], field: "departureMonths", before: [], value: [] },
    ];
    renderWithApi(<ChangeTable changes={changes} ticked={[]} onTickedChange={vi.fn()} />, newQueryClient());
    expect(screen.getByText("1. Delhi")).toBeInTheDocument();
    expect(screen.getByText("1. Agra")).toBeInTheDocument();
    expect(screen.getByText(words.rows.notInNotes)).toBeInTheDocument();
    expect(screen.getByText("Mon, Fri")).toBeInTheDocument();
    expect(screen.getByText(words.rows.noRepeats)).toBeInTheDocument();
    expect(screen.getAllByText(words.rows.everyMonth)).toHaveLength(2);
  });

  it("says where each change came from, and words a reopened departure with its weekday", () => {
    const changes: ProposedChange[] = [
      {
        id: "r1",
        kind: "departure_reopen",
        evidence: [{ ref: "P2.L3", text: "4 Dec batch is on", kind: "photo" }],
        flags: [],
        departureId: "0190a000-0000-7000-8000-0000000000d2",
        startDate: "2027-12-04",
      },
    ];
    renderWithApi(<ChangeTable changes={changes} ticked={[]} onTickedChange={vi.fn()} />, newQueryClient());
    expect(screen.getByText("Reopen the departure on Sat 4 Dec 2027")).toBeInTheDocument();
    expect(screen.getByText("From: 4 Dec batch is on (as the AI read photo 2)")).toBeInTheDocument();
  });
});
