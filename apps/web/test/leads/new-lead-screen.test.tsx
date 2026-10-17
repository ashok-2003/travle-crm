// The new-lead form (spec 3.2, R24, R53): a name and one contact save a lead and open it; the trip's month, budget and
// children's ages travel as the api takes them; a known contact is named before saving, with the choice for an open
// lead (only its destination and owner when the salesperson can't see it); a blocked number warns and still saves;
// the owner picker is for leads:assign; a new destination is added by typing its name, in the shared search picker.
import type { KnownContactResult } from "@travel-crm/contracts/crm";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { NewLeadScreen } from "@/leads/form/new-lead-screen";
import { heldAnswer, stubApi, type Answer } from "../support/api-stub";
import { address } from "./navigation";
import { ids } from "./records";
import { inputsTo, lastInputTo, owner, renderScreen, salesperson } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { form } = messages.leads;
// 11:00 am on Friday 16 October 2026 in India.
const NOW = new Date("2026-10-16T05:30:00Z");

const noMatch: KnownContactResult = { match: null, blocked: false, people: {} };

function knownWith(openLead: NonNullable<KnownContactResult["match"]>["openLead"]): KnownContactResult {
  return {
    match: { personId: ids.person, personName: "Rahul Sharma", matchedBy: "phone", openLead },
    blocked: false,
    people: { [salesperson.user.id]: "Ravi Kumar", [owner.user.id]: "Asha Sharma" },
  };
}

const created = { data: { outcome: "created", leadId: ids.rahul, returning: false } };

function renderForm(answers: Record<string, Answer> = {}, me = owner) {
  const api = stubApi({
    "leads.knownContact": { data: noMatch },
    "leads.create": created,
    "leads.owners": {
      data: [
        { userId: owner.user.id, name: "Asha Sharma" },
        { userId: salesperson.user.id, name: "Ravi Kumar" },
      ],
    },
    "destinations.search": { data: [{ id: ids.kashmir, name: "Kashmir" }] },
    ...answers,
  });
  renderScreen(<NewLeadScreen />, { me });
  return api;
}

/** Types into a field at once, as a paste: the form reads it the same way, and jsdom is slow at keystrokes. */
async function fill(label: string, text: string): Promise<void> {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(text);
}

async function choose(label: string, option: RegExp | string): Promise<void> {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

async function save(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: form.save }));
}

/** The person, then a pause in typing for the known-contact check. */
async function fillPerson(): Promise<void> {
  await fill(form.person.name, "Rahul Sharma");
  await fill(form.person.phone, "98765 43210");
  await waitFor(() => {
    expect(lastInputTo("leads.knownContact")).toEqual({ phone: "+919876543210" });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  address.set("/leads/new");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NewLeadScreen", () => {
  it("needs a name and one contact, and saves with only those, opening the new lead", async () => {
    renderForm();
    await save();
    expect(await screen.findByText(form.problems.name)).toBeVisible();
    expect(screen.getByText(form.problems.contact)).toBeVisible();
    expect(inputsTo("leads.create")).toEqual([]);

    await fillPerson();
    await save();
    await waitFor(() => {
      expect(address.href).toBe(`/leads/${ids.rahul}`);
    });
    expect(inputsTo("leads.create")).toEqual([
      {
        person: { name: "Rahul Sharma", phone: "+919876543210" },
        trip: {
          destination: null,
          when: { kind: "unknown" },
          adults: null,
          childrenAges: [],
          budget: null,
          departureCity: null,
          tripType: null,
          hotelCategory: null,
          food: null,
          roomType: null,
        },
        note: null,
        source: "phone_call",
        sourceDetail: null,
        ownerUserId: null,
        whenOpenLead: null,
      },
    ]);
    expect(await screen.findByText(form.added)).toBeVisible();
  });

  it("sends the month as YYYY-MM, the budget in paise with its basis, and each child's age", async () => {
    renderForm();
    await fillPerson();
    await choose(form.trip.when, form.trip.whenKinds.month);
    await choose(form.trip.month, "December 2026");
    await fill(form.trip.adults, "2");
    await choose(form.trip.children, "1");
    await choose(form.trip.childAge.replace("{number}", "1"), "7");
    await fill(form.trip.budget, "60000");
    await choose(form.trip.budgetBasis, messages.leads.budgetBasis.for_everyone);
    await userEvent.click(screen.getByRole("radio", { name: messages.leads.hotelCategories["4_star"] }));
    await userEvent.click(screen.getByRole("radio", { name: messages.leads.food.jain }));
    await save();
    await waitFor(() => {
      expect(inputsTo("leads.create")).toHaveLength(1);
    });
    expect(lastInputTo("leads.create")).toMatchObject({
      trip: {
        when: { kind: "month", month: "2026-12" },
        adults: 2,
        childrenAges: [7],
        budget: { amount: { amountPaise: 6_000_000, currency: "INR" }, basis: "for_everyone" },
        hotelCategory: "4_star",
        food: "jain",
      },
    });
  });

  it("warns of a known contact with an open lead and sends the choice as whenOpenLead", async () => {
    renderForm({
      "leads.knownContact": {
        data: knownWith({ leadId: ids.rahul, destinationName: "Kashmir", ownerUserId: owner.user.id }),
      },
      "leads.create": { data: { outcome: "added-to-open-lead", leadId: ids.rahul, returning: true } },
    });
    await fillPerson();
    const known = await screen.findByRole("group", { name: form.known.choice });
    expect(screen.getByText("Rahul Sharma already has an open lead (Kashmir, with Asha Sharma)")).toBeVisible();
    expect(screen.getByRole("link", { name: form.known.openThatLead })).toHaveAttribute("href", `/leads/${ids.rahul}`);
    await save();
    expect(await screen.findByText(form.problems.openLead)).toBeVisible();
    // On a phone the choice is far above Save: it takes the focus, and the sentence shows above Save too.
    expect(within(known).getByRole("radio", { name: form.known.addToIt })).toHaveFocus();
    expect(screen.getByText(form.known.chooseFirst)).toBeVisible();
    expect(inputsTo("leads.create")).toEqual([]);

    await userEvent.click(within(known).getByRole("radio", { name: form.known.addToIt }));
    await save();
    await waitFor(() => {
      expect(address.href).toBe(`/leads/${ids.rahul}`);
    });
    expect(lastInputTo("leads.create")).toMatchObject({ whenOpenLead: "add-to-it" });
    expect(await screen.findByText(form.addedToOpenLead)).toBeVisible();
  });

  it("shows only the destination and owner of a lead the salesperson can't see, then returns to Leads with a toast", async () => {
    renderForm(
      {
        "leads.knownContact": { data: knownWith({ leadId: null, destinationName: "Goa", ownerUserId: owner.user.id }) },
        "leads.create": { data: { outcome: "added-to-open-lead", leadId: null, returning: true } },
      },
      salesperson,
    );
    await fillPerson();
    expect(await screen.findByText("Rahul Sharma already has an open lead (Goa, with Asha Sharma)")).toBeVisible();
    expect(screen.queryByRole("link", { name: form.known.openThatLead })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: form.known.addToIt }));
    await save();
    await waitFor(() => {
      expect(address.href).toBe("/leads");
    });
    expect(await screen.findByText("Added to Asha Sharma's lead")).toBeVisible();
  });

  it("asks again when the save answers OPEN_LEAD_EXISTS", async () => {
    const api = renderForm({ "leads.create": { status: 409, reason: "OPEN_LEAD_EXISTS" } });
    await fillPerson();
    const asked = inputsTo("leads.knownContact").length;
    // A colleague added a lead for the same number a moment ago.
    api.answer("leads.knownContact", {
      data: knownWith({ leadId: ids.sneha, destinationName: "Goa", ownerUserId: salesperson.user.id }),
    });
    await save();
    expect(await screen.findByText(form.known.chooseThenSave)).toBeVisible();
    expect(inputsTo("leads.knownContact").length).toBeGreaterThan(asked);
    expect(await screen.findByText("Rahul Sharma already has an open lead (Goa, with Ravi Kumar)")).toBeVisible();
    expect(address.href).toBe("/leads/new");

    api.answer("leads.create", created);
    await userEvent.click(screen.getByRole("radio", { name: form.known.newLead }));
    await save();
    await waitFor(() => {
      expect(address.href).toBe(`/leads/${ids.rahul}`);
    });
    expect(lastInputTo("leads.create")).toMatchObject({ whenOpenLead: "new-lead" });
  });

  it("isn't stuck after OPEN_LEAD_EXISTS when the open lead is gone by the time it asks again", async () => {
    const api = renderForm({ "leads.create": { status: 409, reason: "OPEN_LEAD_EXISTS" } });
    await fillPerson();
    await save();
    await waitFor(() => {
      expect(inputsTo("leads.create")).toHaveLength(1);
    });
    // The colleague's lead was closed meanwhile: the known contact has no open lead, so there is nothing to choose.
    expect(screen.queryByRole("group", { name: form.known.choice })).not.toBeInTheDocument();
    api.answer("leads.create", created);
    await save();
    await waitFor(() => {
      expect(address.href).toBe(`/leads/${ids.rahul}`);
    });
    expect(lastInputTo("leads.create")).toMatchObject({ whenOpenLead: null });
  });

  it("shows the person's stored name and says the lead will be marked returning", async () => {
    renderForm({ "leads.knownContact": { data: knownWith(null) } });
    await fill(form.person.name, "Rahul S");
    await fill(form.person.phone, "98765 43210");
    expect(await screen.findByText(form.known.returning.replace("{name}", "Rahul Sharma"))).toBeVisible();
    expect(screen.getByText(form.known.storedName.replace("{name}", "Rahul Sharma"))).toBeVisible();
    expect(screen.queryByRole("group", { name: form.known.choice })).not.toBeInTheDocument();
  });

  it("warns that a number is blocked and still saves", async () => {
    renderForm({ "leads.knownContact": { data: { ...noMatch, blocked: true } } });
    await fillPerson();
    expect(await screen.findByText(form.known.blocked)).toBeVisible();
    await save();
    await waitFor(() => {
      expect(address.href).toBe(`/leads/${ids.rahul}`);
    });
  });

  it("offers the owner picker only with leads:assign, defaulting to me", async () => {
    renderForm();
    const picker = screen.getByRole("combobox", { name: form.owner });
    expect(picker).toHaveTextContent(form.me.replace("{name}", "Asha Sharma"));
    await choose(form.owner, "Ravi Kumar");
    await fillPerson();
    await save();
    await waitFor(() => {
      expect(lastInputTo("leads.create")).toMatchObject({ ownerUserId: salesperson.user.id });
    });
  });

  it("gives a salesperson no owner picker: the lead is theirs", async () => {
    renderForm({}, salesperson);
    await fillPerson();
    expect(screen.queryByRole("combobox", { name: form.owner })).not.toBeInTheDocument();
    await save();
    await waitFor(() => {
      expect(lastInputTo("leads.create")).toMatchObject({ ownerUserId: null });
    });
  });

  it("adds a new destination by typing its name in the combobox", async () => {
    renderForm({ "destinations.search": { data: [] } });
    await fillPerson();
    await userEvent.click(screen.getByRole("combobox", { name: form.trip.destination }));
    await userEvent.type(await screen.findByPlaceholderText(form.destination.searchOrAdd), "Spiti");
    await userEvent.click(await screen.findByRole("option", { name: form.destination.add.replace("{name}", "Spiti") }));
    expect(screen.getByRole("combobox", { name: form.trip.destination })).toHaveTextContent("Spiti");
    await save();
    await waitFor(() => {
      expect(lastInputTo("leads.create")).toMatchObject({ trip: { destination: { kind: "new", name: "Spiti" } } });
    });
  });

  it("says what the destination search is doing in a status outside the list, as every search picker does", async () => {
    const found = heldAnswer({ data: [{ id: ids.kashmir, name: "Kashmir" }] });
    const api = renderForm({ "destinations.search": found.answer });
    await userEvent.click(screen.getByRole("combobox", { name: form.trip.destination }));
    const status = await screen.findByRole("status");
    expect(screen.getByRole("listbox")).not.toContainElement(status);
    expect(status).toHaveTextContent(form.destination.searching);
    found.release();
    expect(await screen.findByRole("option", { name: "Kashmir" })).toBeVisible();
    expect(status).toBeEmptyDOMElement();
    api.answer("destinations.search", { data: [] });
    await userEvent.type(screen.getByPlaceholderText(form.destination.searchOrAdd), "Spiti");
    await waitFor(() => {
      expect(status).toHaveTextContent(form.destination.noMatch);
    });
    // A name that isn't on the list can still be added.
    expect(screen.getByRole("option", { name: form.destination.add.replace("{name}", "Spiti") })).toBeVisible();
  });

  it("offers No destination once one is chosen, which empties the field again", async () => {
    renderForm();
    await choose(form.trip.destination, "Kashmir");
    const trigger = screen.getByRole("combobox", { name: form.trip.destination });
    expect(trigger).toHaveTextContent("Kashmir");
    await choose(form.trip.destination, form.destination.clear);
    expect(trigger).toHaveTextContent(form.destination.placeholder);
  });

  it("says when the destinations didn't load, with Try again by Enter too, and still adds a new one", async () => {
    const api = renderForm({ "destinations.search": { status: 500 } });
    await userEvent.click(screen.getByRole("combobox", { name: form.trip.destination }));
    expect(await screen.findByRole("status")).toHaveTextContent(messages.errors.generic);
    expect(screen.queryByText(form.destination.noMatch)).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(form.destination.searchOrAdd), "Spiti");
    expect(await screen.findByRole("option", { name: form.destination.add.replace("{name}", "Spiti") })).toBeVisible();
    // Enter on Try again asks again; it never picks the highlighted option, and the failure isn't in the listbox.
    api.answer("destinations.search", { data: [{ id: ids.goa, name: "Spiti Valley" }] });
    const asked = inputsTo("destinations.search").length;
    const retry = screen.getByRole("button", { name: messages.common.tryAgain });
    expect(screen.getByRole("listbox")).not.toContainElement(retry);
    retry.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("option", { name: "Spiti Valley" })).toBeVisible();
    expect(inputsTo("destinations.search").length).toBeGreaterThan(asked);
    const [trigger] = screen.getAllByRole("combobox", { name: form.trip.destination });
    expect(trigger).toHaveTextContent(form.destination.placeholder);
  });
});
