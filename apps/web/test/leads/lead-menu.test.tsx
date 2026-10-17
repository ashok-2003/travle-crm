// A lead's ⋯ menu (spec 3.4, R33): Reassign, Lost, Not a lead and Block this number; the first three ask first
// (Lost, Not a lead and Block); Reassign and Block need leads:assign, and Reassign gives the lead to one of the people
// who can work leads.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadMenu } from "@/leads/lead/lead-menu";
import { stubApi } from "../support/api-stub";
import { aLead, ids } from "./records";
import { inputsTo, owner, renderScreen, salesperson } from "./screen";

const { lead: words } = messages.leads;

function renderMenu(me = owner, changes: Parameters<typeof aLead>[0] = {}) {
  const api = stubApi({
    "leads.moveStage": { data: null },
    "leads.block": { data: null },
    "leads.reassign": { data: null },
    "leads.owners": {
      data: [
        { userId: owner.user.id, name: "Asha Sharma" },
        { userId: salesperson.user.id, name: "Ravi Kumar" },
      ],
    },
  });
  renderScreen(<LeadMenu lead={aLead(changes)} />, { me, width: "wide" });
  return api;
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: words.menu.label.replace("{name}", "Rahul Sharma") }));
  return screen.findByRole("menu");
}

async function chooseAndConfirm(item: string, confirm: string) {
  await userEvent.click(within(await openMenu()).getByRole("menuitem", { name: item }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: confirm }));
  await waitFor(() => {
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadMenu", () => {
  it("asks before Lost, Not a lead and Block this number; Block and Reassign need leads:assign", async () => {
    renderMenu();
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([words.menu.reassign, words.menu.lost, words.menu.notALead, words.menu.block]);
    await userEvent.keyboard("{Escape}");

    await chooseAndConfirm(words.menu.lost, words.lost.confirm);
    expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "lost" }]);
    await chooseAndConfirm(words.menu.notALead, words.notALead.confirm);
    expect(inputsTo("leads.moveStage")).toEqual([
      { leadId: ids.rahul, stage: "lost" },
      { leadId: ids.rahul, stage: "not_a_lead" },
    ]);
    await chooseAndConfirm(words.menu.block, words.block.confirm);
    expect(inputsTo("leads.block")).toEqual([{ leadId: ids.rahul }]);
    expect(await screen.findByText(words.block.done)).toBeVisible();
  });

  it("lets a dialog be cancelled without a change, giving the focus back to the ⋯ button", async () => {
    renderMenu();
    await userEvent.click(within(await openMenu()).getByRole("menuitem", { name: words.menu.lost }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(words.lost.description);
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.cancel }));
    expect(inputsTo("leads.moveStage")).toEqual([]);
    // The dialog isn't the menu's own: the focus comes back to the ⋯ button, not to nowhere.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: words.menu.label.replace("{name}", "Rahul Sharma") })).toHaveFocus();
    });
  });

  it("gives a salesperson Lost and Not a lead only, and leaves out the stage the lead is in", async () => {
    renderMenu(salesperson, { stage: "lost", reopenStage: "contacted" });
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([words.menu.notALead]);
  });

  it("names the contact it blocks when the person has no phone", async () => {
    renderMenu(owner, {
      person: { id: ids.person, name: "Rahul Sharma", phone: null, email: "rahul@example.com", instagramHandle: null },
    });
    expect(within(await openMenu()).getByRole("menuitem", { name: words.menu.blockContact })).toBeVisible();
  });

  it("starts with no one chosen, names the lead's owner and leaves them out: nothing to reassign to", async () => {
    renderMenu();
    await userEvent.click(within(await openMenu()).getByRole("menuitem", { name: words.menu.reassign }));
    const dialog = await screen.findByRole("dialog", { name: words.reassign.title });
    const described = words.reassign.description.replace("{name}", "Rahul Sharma").replace("{owner}", "Asha Sharma");
    expect(within(dialog).getByText(described)).toBeVisible();
    const picker = within(dialog).getByRole("combobox", { name: words.reassign.owner });
    expect(picker).toHaveTextContent(words.reassign.choose);
    await userEvent.click(within(dialog).getByRole("button", { name: words.reassign.submit }));
    expect(await within(dialog).findByText(words.reassign.problems.required)).toBeVisible();
    expect(inputsTo("leads.reassign")).toEqual([]);
    await userEvent.click(picker);
    expect(await screen.findByRole("option", { name: "Ravi Kumar" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Asha Sharma" })).not.toBeInTheDocument();
  });

  it("says whose the lead was without a name it doesn't know", async () => {
    renderMenu(owner, { people: {} });
    await userEvent.click(within(await openMenu()).getByRole("menuitem", { name: words.menu.reassign }));
    const dialog = await screen.findByRole("dialog", { name: words.reassign.title });
    expect(within(dialog).getByText(words.reassign.descriptionNoOwner.replace("{name}", "Rahul Sharma"))).toBeVisible();
  });

  it("reassigns to a lead worker from the owner list", async () => {
    renderMenu();
    await userEvent.click(within(await openMenu()).getByRole("menuitem", { name: words.menu.reassign }));
    const dialog = await screen.findByRole("dialog", { name: words.reassign.title });
    const picker = within(dialog).getByRole("combobox", { name: words.reassign.owner });
    await userEvent.click(picker);
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(within(dialog).getByRole("button", { name: words.reassign.submit }));
    await waitFor(() => {
      expect(inputsTo("leads.reassign")).toEqual([{ leadId: ids.rahul, ownerUserId: salesperson.user.id }]);
    });
    expect(await screen.findByText(words.reassign.done.replace("{name}", "Ravi Kumar"))).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("shows the api's refusal of a reassignment in the dialog", async () => {
    const api = renderMenu();
    api.answer("leads.reassign", { status: 422, reason: "NOT_A_LEAD_WORKER" });
    await userEvent.click(within(await openMenu()).getByRole("menuitem", { name: words.menu.reassign }));
    const dialog = await screen.findByRole("dialog", { name: words.reassign.title });
    await userEvent.click(within(dialog).getByRole("combobox", { name: words.reassign.owner }));
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(within(dialog).getByRole("button", { name: words.reassign.submit }));
    expect(await within(dialog).findByText(messages.errors.reasons.NOT_A_LEAD_WORKER)).toBeVisible();
  });

  it("says when the people who can work leads didn't load, with Try again, and can't be sent", async () => {
    const api = renderMenu();
    api.answer("leads.owners", { status: 500 });
    await userEvent.click(within(await openMenu()).getByRole("menuitem", { name: words.menu.reassign }));
    const dialog = await screen.findByRole("dialog", { name: words.reassign.title });
    expect(await within(dialog).findByText(messages.leads.ownersFailed)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: words.reassign.submit })).toBeDisabled();
    api.answer("leads.owners", { data: [{ userId: salesperson.user.id, name: "Ravi Kumar" }] });
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.tryAgain }));
    expect(await within(dialog).findByRole("combobox", { name: words.reassign.owner })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: words.reassign.submit })).toBeEnabled();
  });
});
