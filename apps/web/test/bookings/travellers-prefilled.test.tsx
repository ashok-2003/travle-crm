// Travellers pre-filled from the lead: a pre-filled name and phone sit on the primary tint (one shared class) until a person
// saves the traveller, and the level and the count are behind the card's "⋯" menu, not on the card.
import type { Traveller } from "@travel-crm/contracts/bookings";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { prefilledField } from "@/components/card-tints";
import { TravellersCard } from "@/bookings/travellers-card";
import { messages } from "@/i18n/messages";
import { renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aBooking } from "./booking";

const words = messages.bookings.travellers;
const editor = member({ permissions: ["bookings:view", "bookings:edit"] });
const aTraveller = (changes: Partial<Traveller> = {}): Traveller => ({
  id: "0199a000-0000-7000-8000-0000000000t1",
  position: 0,
  name: "Meera Iyer",
  dateOfBirth: null,
  gender: null,
  phone: "+919876500002",
  emergencyName: "",
  emergencyPhone: "",
  medicalNotes: "",
  roomRequest: "none",
  roomNote: "",
  complete: false,
  hasIdentity: false,
  prefilled: ["name", "phone"],
  ...changes,
});
const tint = prefilledField.split(" ");

describe("pre-filled travellers", () => {
  it("shows a pre-filled name on the tint with the words 'check it', and a saved one plain", () => {
    stubApi({});
    const saved = aTraveller({ id: "0199a000-0000-7000-8000-0000000000t2", name: "Ravi Iyer", prefilled: [] });
    renderScreen(<TravellersCard booking={aBooking({ travellers: [aTraveller(), saved], travellersTotal: 2 })} />, {
      me: editor,
      width: "wide",
    });
    const [first, second] = screen.getAllByRole("listitem").map((row) => within(row));
    if (first === undefined || second === undefined) throw new Error("two travellers expected");
    expect(first.getByText("Meera Iyer").className).toContain(tint[0]);
    expect(first.getByText(new RegExp(words.prefilled))).toBeVisible();
    expect(second.getByText("Ravi Iyer").className).not.toContain(tint[0]);
    expect(second.queryByText(new RegExp(words.prefilled))).toBeNull();
  });

  it("puts the name and phone fields of the dialog on the tint until saved", async () => {
    stubApi({});
    renderScreen(<TravellersCard booking={aBooking({ travellers: [aTraveller()], travellersTotal: 1 })} />, {
      me: editor,
      width: "wide",
    });
    await userEvent.click(screen.getByRole("button", { name: /Fill in|Edit/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(words.form.name).className).toContain(tint[0]);
    expect(within(dialog).getByLabelText(words.form.phone).className).toContain(tint[0]);
    expect(within(dialog).getByLabelText(words.form.dateOfBirth)).not.toHaveClass(tint[0] ?? "");
  });

  it("keeps the level and the count in the card's menu", async () => {
    stubApi({});
    renderScreen(<TravellersCard booking={aBooking({ travellers: [aTraveller()], travellersTotal: 1 })} />, {
      me: editor,
      width: "wide",
    });
    expect(screen.queryByLabelText(words.level)).toBeNull();
    expect(screen.queryByRole("group", { name: words.count })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: words.menu }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.settings }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: words.level })).toBeVisible();
    expect(within(dialog).getByRole("group", { name: words.count })).toBeVisible();
  });
});
