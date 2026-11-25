// The Special prices dialog: a period's name, its dates (or none for "until I change them") and a price per room sold.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SpecialPricesDialog } from "@/packages/special-prices-dialog";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aPackage } from "./detail";

const words = messages.packages.specialPrices;
const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };
const detail = aPackage({ kind: "group", roomTypes: ["double", "triple"] });

function Opened({ from = "", to = "" }: { from?: string; to?: string }) {
  const [open, setOpen] = useState(true);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener}>opener</button>
      <SpecialPricesDialog detail={detail} range={{ from, to }} held={{ open, setOpen }} returnFocusTo={opener} />
    </>
  );
}

async function typeDates(from: string, to: string) {
  await userEvent.type(screen.getByRole("textbox", { name: words.startsOn }), from);
  if (to !== "") await userEvent.type(screen.getByRole("textbox", { name: words.endsOn }), to);
}

describe("SpecialPricesDialog", () => {
  beforeEach(() => {
    screenIs("wide");
  });

  it("saves special prices with the dates and room prices typed", async () => {
    const api = fakeApi();
    renderWithApi(<Opened />, newQueryClient());
    await typeDates("01/12/2027", "10/12/2027");
    await userEvent.type(screen.getByRole("textbox", { name: "Double, per person" }), "15000");
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(api.last().path).toBe("packages.saveSpecialPrices");
    expect(api.last().input).toEqual({
      packageId: detail.id,
      label: messages.packages.calendar.specialLabel,
      startsOn: "2027-12-01",
      endsOn: "2027-12-10",
      prices: { ...none, double: 1500000 },
    });
  });

  it("starts from the range it was given", () => {
    renderWithApi(<Opened from="2027-12-01" to="2027-12-10" />, newQueryClient());
    expect(screen.getByRole("textbox", { name: words.startsOn })).toHaveProperty("value", "01/12/2027");
    expect(screen.getByRole("textbox", { name: words.endsOn })).toHaveProperty("value", "10/12/2027");
  });

  it("Until I change them sends no end date", async () => {
    const api = fakeApi();
    renderWithApi(<Opened />, newQueryClient());
    await typeDates("01/12/2027", "");
    await userEvent.click(screen.getByRole("switch", { name: words.openEnded }));
    expect(screen.queryByRole("textbox", { name: words.endsOn })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Triple, per person" }), "12000");
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await waitFor(() => {
      expect(api.calls.length).toBeGreaterThan(0);
    });
    expect(api.last().input).toMatchObject({ startsOn: "2027-12-01", endsOn: null });
  });

  it("shows only the room types the trip sells", () => {
    renderWithApi(<Opened />, newQueryClient());
    expect(screen.getByRole("textbox", { name: "Double, per person" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Triple, per person" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Single, per person" })).toBeNull();
  });

  it("asks for a price before sending", async () => {
    const api = fakeApi();
    renderWithApi(<Opened />, newQueryClient());
    await typeDates("01/12/2027", "10/12/2027");
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    expect(await screen.findByText(words.problems.noPrice)).toBeTruthy();
    expect(api.calls).toHaveLength(0);
  });
});
