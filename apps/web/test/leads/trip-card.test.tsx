// A lead's trip (spec 3.4, R49, P8): where, when, who, the budget (a per-person budget also "About … for everyone"
// when the travellers are known) and the preferences, edited with the new-lead form's own trip fields, which send the
// whole trip back.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { TripCard } from "@/leads/lead/trip-card";
import { stubApi } from "../support/api-stub";
import { aLead, ids } from "./records";
import { lastInputTo, renderScreen } from "./screen";

const { trip: words } = messages.leads.lead;
const NOW = new Date("2026-10-16T05:30:00Z");

/** Each row of the card: its label, then its value and anything under it. */
function rows(): string[] {
  const card = screen.getByRole("region", { name: words.title });
  return within(card)
    .getAllByRole("listitem")
    .map((row) => row.textContent);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TripCard", () => {
  it("shows '₹60,000 per person' and 'About ₹1,80,000 for everyone' for three travellers", () => {
    stubApi({});
    renderScreen(<TripCard lead={aLead()} />);
    expect(rows()).toEqual([
      "DestinationKashmir",
      "WhenDecember, dates not fixed",
      "Travellers2 adults, 1 child (7)",
      "Budget₹60,000 per personAbout ₹1,80,000 for everyone",
      "Leaving fromDelhi",
      "Trip typeFamily",
      `Hotel${messages.leads.hotelCategories["4_star"]}`,
      "FoodVegetarian",
    ]);
  });

  it("says what isn't asked yet, and gives exact dates as a range", () => {
    stubApi({});
    renderScreen(
      <TripCard
        lead={aLead({
          trip: {
            ...aLead().trip,
            destination: null,
            when: { kind: "dates", from: "2026-11-14", to: "2026-11-20" },
            adults: null,
            childrenAges: [],
            budget: { amount: { amountPaise: 18_000_000, currency: "INR" }, basis: "for_everyone" },
          },
        })}
      />,
    );
    expect(rows().slice(0, 4)).toEqual([
      `Destination${words.notAsked}`,
      "When14 – 20 Nov",
      `Travellers${words.notAsked}`,
      "Budget₹1,80,000 for everyone",
    ]);
  });

  it("edits the trip with the form's own trip fields", async () => {
    stubApi({
      "leads.editTrip": { data: null },
      "destinations.search": { data: [{ id: ids.kashmir, name: "Kashmir" }] },
    });
    renderScreen(<TripCard lead={aLead()} />);
    await userEvent.click(screen.getByRole("button", { name: words.edit }));
    const dialog = await screen.findByRole("dialog", { name: words.dialog.title });
    const form = messages.leads.form.trip;
    expect(within(dialog).getByRole("combobox", { name: form.destination })).toHaveTextContent("Kashmir");
    expect(within(dialog).getByRole("combobox", { name: form.month })).toHaveTextContent("December 2026");
    const adults = within(dialog).getByLabelText(form.adults);
    await userEvent.clear(adults);
    await userEvent.type(adults, "3");
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.submit }));
    await waitFor(() => {
      expect(lastInputTo("leads.editTrip")).toEqual({
        leadId: ids.rahul,
        trip: {
          destination: { kind: "existing", destinationId: ids.kashmir },
          when: { kind: "month", month: "2026-12" },
          adults: 3,
          childrenAges: [7],
          budget: { amount: { amountPaise: 6_000_000, currency: "INR" }, basis: "per_person" },
          departureCity: "Delhi",
          tripType: "family",
          hotelCategory: "4_star",
          food: "veg",
          roomType: null,
        },
      });
    });
    expect(await screen.findByText(words.saved)).toBeVisible();
  });
});
