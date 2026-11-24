// Copy a line to other trips: the notes' first line, the agency's other trips to tick, and what came of it.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { describe, expect, it } from "vitest";
import { CopyNoteDialog } from "@/packages/copy-note-dialog";
import { messages } from "@/i18n/messages";
import { lastInputTo, renderScreen } from "../leads/screen";
import { stubApi, type Answer } from "../support/api-stub";
import { aPackage } from "./detail";

const words = messages.packages.copyNote;
const editing = aPackage({ notes: "\nNo single rooms from 18 Dec\nCarry warm clothes" });
const spiti = "0190a000-0000-7000-8000-0000000000b1";
const ladakh = "0190a000-0000-7000-8000-0000000000b2";

/** A trip as the Packages list has it. */
const trip = (id: string, name: string): QuotePackage => ({
  id,
  name,
  title: name,
  days: 0,
  subtotalPaise: 0,
  taxRateBasisPoints: 500,
  published: false,
  slug: null,
  tierCount: 0,
  kind: "group",
  nights: 5,
  fromPricePaise: null,
  aiSellable: false,
  departuresAhead: 0,
});

/** Opens the dialog over the agency's trips (this one among them), copyNote answering `copied`. */
async function open(copied: Answer = { data: { copied: [], alreadyThere: [], tooLong: [] } }) {
  stubApi({
    "quotes.packages": {
      data: [trip(editing.id, editing.name), trip(spiti, "Spiti 7 days"), trip(ladakh, "Ladakh 8 days")],
    },
    "packages.copyNote": copied,
  });
  renderScreen(<CopyNoteDialog detail={editing} />, { width: "wide" });
  await userEvent.click(screen.getByRole("button", { name: words.open }));
  await screen.findByRole("checkbox", { name: "Spiti 7 days" });
}

describe("CopyNoteDialog", () => {
  it("copies the line to the chosen trips and says which already had it", async () => {
    await open({ data: { copied: [spiti], alreadyThere: [ladakh], tooLong: [] } });
    expect(screen.getByRole("textbox", { name: words.line })).toHaveValue("No single rooms from 18 Dec");
    await userEvent.click(screen.getByRole("checkbox", { name: "Spiti 7 days" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Ladakh 8 days" }));
    await userEvent.click(screen.getByRole("button", { name: words.copy }));
    await waitFor(() => {
      expect(lastInputTo("packages.copyNote")).toEqual({
        line: "No single rooms from 18 Dec",
        packageIds: [spiti, ladakh],
      });
    });
    expect(await screen.findByText("Copied to 1 trip.")).toBeTruthy();
    expect(screen.getByText(words.alreadyThere.replace("{trips}", "Ladakh 8 days"))).toBeTruthy();
  });

  it("never lists the trip being edited", async () => {
    await open();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByRole("checkbox", { name: editing.name })).toBeNull();
  });

  it("says which trips were skipped as too long", async () => {
    await open({ data: { copied: [], alreadyThere: [], tooLong: [spiti] } });
    await userEvent.click(screen.getByRole("checkbox", { name: "Spiti 7 days" }));
    await userEvent.click(screen.getByRole("button", { name: words.copy }));
    expect(await screen.findByText(words.tooLong.replace("{trips}", "Spiti 7 days"))).toBeTruthy();
  });

  it("asks for a trip before it copies", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: words.copy }));
    expect(await screen.findByText(words.problems.noTrip)).toBeTruthy();
    expect(lastInputTo("packages.copyNote")).toBeUndefined();
  });
});
