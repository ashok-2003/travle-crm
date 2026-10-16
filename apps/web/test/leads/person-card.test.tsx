// A lead's person (spec 3.4, 4, R32, P7, P10): their name and contacts, edited with the new-lead form's own fields.
// Before saving, a changed contact that is already on another person is named with that person (knownContact); one
// that is this person's own is not. The api's CONTACT_ON_ANOTHER_PERSON shows its sentence.
import type { KnownContactResult } from "@travel-crm/contracts/crm";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { PersonCard } from "@/leads/lead/person-card";
import { stubApi } from "../support/api-stub";
import { aLead, ids } from "./records";
import { inputsTo, lastInputTo, renderScreen } from "./screen";

const { person: words } = messages.leads.lead;
const { person: fields } = messages.leads.form;

const heldBy = (personId: string, personName: string): { data: KnownContactResult } => ({
  data: { match: { personId, personName, matchedBy: "phone", openLead: null }, blocked: false, people: {} },
});

function renderCard(knownContact = heldBy(ids.otherPerson, "Priya Nair")) {
  const api = stubApi({ "leads.knownContact": knownContact, "leads.editPerson": { data: null } });
  renderScreen(<PersonCard lead={aLead()} />);
  return api;
}

/** The sentence the app shows for a refusal: its own, or the generic one until the api's words are in. */
const sentenceFor = (reason: string) =>
  (messages.errors.reasons as Record<string, string | undefined>)[reason] ?? messages.errors.generic;

async function openEditor() {
  await userEvent.click(screen.getByRole("button", { name: words.edit }));
  return screen.findByRole("dialog", { name: words.dialog.title });
}

async function replace(dialog: HTMLElement, label: string, text: string) {
  const field = within(dialog).getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.click(field);
  await userEvent.paste(text);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonCard", () => {
  it("shows the person's name and contacts", () => {
    renderCard();
    const card = screen.getByRole("region", { name: words.title });
    expect(within(card).getByText("Rahul Sharma")).toBeVisible();
    expect(within(card).getByText("+91 98765 43210")).toBeVisible();
    expect(within(card).getByText("rahul.s@gmail.com")).toBeVisible();
  });

  it("names who holds a contact before saving a person, and shows CONTACT_ON_ANOTHER_PERSON's sentence", async () => {
    const api = renderCard();
    const dialog = await openEditor();
    expect(within(dialog).getByLabelText(fields.name)).toHaveValue("Rahul Sharma");
    expect(within(dialog).getByLabelText(fields.phone)).toHaveValue("98765 43210");
    // The phone as stored is this person's own: nothing is asked about it.
    expect(inputsTo("leads.knownContact")).toEqual([]);

    await replace(dialog, fields.phone, "98450 11234");
    await waitFor(() => {
      expect(lastInputTo("leads.knownContact")).toEqual({ phone: "+919845011234" });
    });
    expect(
      await within(dialog).findByText(
        words.holder
          .replace("{contact}", messages.leads.lead.person.contactKinds.phone)
          .replace("{name}", "Priya Nair"),
      ),
    ).toBeVisible();

    api.answer("leads.editPerson", { status: 409, reason: "CONTACT_ON_ANOTHER_PERSON" });
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.submit }));
    expect(await within(dialog).findByText(sentenceFor("CONTACT_ON_ANOTHER_PERSON"))).toBeVisible();
    expect(lastInputTo("leads.editPerson")).toEqual({
      leadId: ids.rahul,
      person: { name: "Rahul Sharma", phone: "+919845011234", email: "rahul.s@gmail.com" },
    });
  });

  it("says nothing of a contact that is the person's own, and saves", async () => {
    renderCard(heldBy(ids.person, "Rahul Sharma"));
    const dialog = await openEditor();
    await replace(dialog, fields.instagramHandle, "@Rahul.Travels");
    await waitFor(() => {
      expect(lastInputTo("leads.knownContact")).toEqual({ instagramHandle: "rahul.travels" });
    });
    expect(within(dialog).queryByText(/already/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.submit }));
    await waitFor(() => {
      expect(lastInputTo("leads.editPerson")).toEqual({
        leadId: ids.rahul,
        person: {
          name: "Rahul Sharma",
          phone: "+919876543210",
          email: "rahul.s@gmail.com",
          instagramHandle: "rahul.travels",
        },
      });
    });
    expect(await screen.findByText(words.saved)).toBeVisible();
  });
});
