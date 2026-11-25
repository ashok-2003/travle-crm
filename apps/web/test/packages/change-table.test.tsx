// The change table: a tick, What, Now and New per change; a flagged change in red with its reason and unticked.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangeTable, cleanChangeIds } from "@/packages/ai-changes/change-table";
import { messages } from "@/i18n/messages";
import { newQueryClient, renderWithApi } from "../organization/api";
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
    const row = screen.getByRole("row", { name: /Cancel the departure on 12 Dec/ });
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
});
