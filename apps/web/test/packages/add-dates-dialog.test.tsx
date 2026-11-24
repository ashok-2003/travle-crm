// The Add dates dialog: a range and the weekdays wanted, and what came of it.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AddDatesDialog } from "@/packages/add-dates-dialog";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aPackage } from "./detail";

const words = messages.packages.addDates;
const detail = aPackage({ kind: "group", roomTypes: ["double"] });

function Opened() {
  const [open, setOpen] = useState(true);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener}>opener</button>
      <AddDatesDialog packageId={detail.id} held={{ open, setOpen }} returnFocusTo={opener} />
    </>
  );
}

async function sendRange() {
  await userEvent.type(screen.getByRole("textbox", { name: words.from }), "01/12/2027");
  await userEvent.type(screen.getByRole("textbox", { name: words.to }), "14/12/2027");
}

describe("AddDatesDialog", () => {
  beforeEach(() => {
    screenIs("wide");
  });

  it("sends the range and the picked weekdays and says how many dates were added", async () => {
    const api = fakeApi();
    renderWithApi(<Opened />, newQueryClient());
    await sendRange();
    await userEvent.click(screen.getByRole("button", { name: messages.packages.form.weekdays["6"] }));
    await userEvent.click(screen.getByRole("button", { name: words.add }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(api.last().path).toBe("departures.addPackageDates");
    expect(api.last().input).toEqual({ packageId: detail.id, from: "2027-12-01", to: "2027-12-14", weekdays: [6] });
    api.last().answer({ added: ["2027-12-04", "2027-12-11"], alreadyThere: [], cancelled: [] });
    expect(await screen.findByText("2 dates added.")).toBeTruthy();
  });

  it("sends no weekdays when none is picked: every day", async () => {
    const api = fakeApi();
    renderWithApi(<Opened />, newQueryClient());
    await sendRange();
    await userEvent.click(screen.getByRole("button", { name: words.add }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(api.last().input).toMatchObject({ weekdays: [] });
  });

  it("lists days already taken, and offers Reopen beside a cancelled one", async () => {
    const api = fakeApi();
    renderWithApi(<Opened />, newQueryClient());
    await sendRange();
    await userEvent.click(screen.getByRole("button", { name: words.add }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    api.last().answer({
      added: [],
      alreadyThere: ["2027-12-04"],
      cancelled: [{ date: "2027-12-11", departureId: "0190a000-0000-7000-8000-0000000000d1" }],
    });
    expect(await screen.findByText(/Already there: 4 Dec/)).toBeTruthy();
    const row = screen.getByText(/11 Dec/).closest("li");
    expect(row).not.toBeNull();
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: messages.packages.calendar.reopen }));
    await waitFor(() => {
      expect(api.calls.at(-1)?.path).toBe("departures.reopen");
    });
    expect(api.last().input).toEqual({ departureId: "0190a000-0000-7000-8000-0000000000d1" });
  });
});
