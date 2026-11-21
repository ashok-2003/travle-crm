// The Leads list's Show (leads show spec, 2026-11-21): a choice in Filters (All leads, Hot, Follow-up overdue, Not
// contacted yet, AI needs a person, or "AI needs you" on Mine), one at a time, kept in the address. While on, the list
// and the stage chips' counts ask for it, Filters counts it, and it heads the chips as the chosen one, which lets it go.
// It follows the tabs, and Clear all lets it go too.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { forgetTabValues } from "@/lib/tab-storage";
import { LeadsScreen } from "@/leads/list/leads-screen";
import { stubApi } from "../support/api-stub";
import { address } from "./navigation";
import { aListItem, aPage, counts } from "./records";
import { inputsTo, lastInputTo, renderScreen, salesperson } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { list } = messages.leads;
const { shows } = list;

function renderLeads(options: Parameters<typeof renderScreen>[1] = {}) {
  stubApi({
    "leads.list": aPage([aListItem()]),
    "leads.counts": { data: counts },
    "leads.owners": { data: [] },
    "destinations.search": { data: [] },
  });
  renderScreen(<LeadsScreen />, options);
}

async function openFilters(name: string = list.filters) {
  await userEvent.click(await screen.findByRole("button", { name }));
  return screen.findByRole("dialog", { name: list.filtersDialog.title });
}

beforeEach(() => {
  address.set("/leads");
  forgetTabValues();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Leads list's Show", () => {
  it("offers Show first in Filters, 'AI needs you' while Mine is open, and writes the choice to the address", async () => {
    renderLeads();
    const filters = await openFilters();
    const show = within(filters).getByRole("combobox", { name: list.filtersDialog.show });
    expect(within(filters).getAllByRole("combobox")[0]).toBe(show);
    expect(show).toHaveTextContent(shows.all);
    await userEvent.click(show);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      shows.all,
      shows.hot,
      shows.overdue,
      shows.uncontacted,
      shows.aiMine,
    ]);
    await userEvent.click(screen.getByRole("option", { name: shows.hot }));
    await userEvent.click(within(filters).getByRole("button", { name: list.filtersDialog.apply }));
    expect(address.href).toBe("/leads?show=hot");
  });

  it("says 'AI needs a person' on everyone's leads", async () => {
    address.set("/leads?view=everyone");
    renderLeads();
    const filters = await openFilters();
    await userEvent.click(within(filters).getByRole("combobox", { name: list.filtersDialog.show }));
    expect(screen.getByRole("option", { name: shows.ai })).toBeVisible();
    expect(screen.queryByRole("option", { name: shows.aiMine })).toBeNull();
  });

  it("asks the list and the chips' counts for it, counts it in Filters, and heads the chips with it chosen", async () => {
    address.set("/leads?view=everyone&show=overdue");
    renderLeads();
    await waitFor(() => {
      expect(lastInputTo("leads.list")).toEqual({
        view: "everyone",
        stage: "open",
        show: "overdue",
        page: 1,
        limit: 20,
      });
    });
    expect(inputsTo("leads.counts")).toContainEqual({ view: "everyone", show: "overdue" });
    expect(screen.getByRole("button", { name: list.filtersChosen.replace("{count}", "1") })).toBeVisible();
    const chip = screen.getByRole("button", { name: list.showChip.replace("{show}", shows.overdue) });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveTextContent(shows.overdue);
  });

  it("lets the Show go from its chip, giving the focus to Filters, and from Filters' All leads or Clear all", async () => {
    address.set("/leads?view=everyone&show=uncontacted");
    renderLeads();
    await userEvent.click(
      await screen.findByRole("button", { name: list.showChip.replace("{show}", shows.uncontacted) }),
    );
    expect(address.href).toBe("/leads?view=everyone");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: list.filters })).toHaveFocus();
    });

    address.set("/leads?view=everyone&show=hot");
    let filters = await openFilters(list.filtersChosen.replace("{count}", "1"));
    await userEvent.click(within(filters).getByRole("combobox", { name: list.filtersDialog.show }));
    await userEvent.click(screen.getByRole("option", { name: shows.all }));
    await userEvent.click(within(filters).getByRole("button", { name: list.filtersDialog.apply }));
    expect(address.href).toBe("/leads?view=everyone");

    address.set("/leads?show=ai&stage=new");
    filters = await openFilters(list.filtersChosen.replace("{count}", "1"));
    await userEvent.click(within(filters).getByRole("button", { name: list.filtersDialog.clear }));
    expect(address.href).toBe("/leads");
  });

  it("follows the tabs: the Show stays as Mine, Everyone or Unassigned is chosen", async () => {
    address.set("/leads?show=hot");
    renderLeads();
    await userEvent.click(await screen.findByRole("tab", { name: list.everyone }));
    expect(address.href).toBe("/leads?view=everyone&show=hot");
  });

  it("names it 'AI needs you' for a salesperson, whose list is their own", async () => {
    address.set("/leads?show=ai");
    renderLeads({ me: salesperson });
    expect(await screen.findByRole("button", { name: list.showChip.replace("{show}", shows.aiMine) })).toBeVisible();
  });
});
