// The Leads list (spec 3.3, R41-R44): Mine · open by default, newest first with Show more; managers switch Mine and
// Everyone and filter by owner; a search by name or phone after a pause, never in an address and found again on the
// way back; quick stage chips with counts; each row's name, trip, stage and what's next, and the Table on a computer;
// honest loading, empty, error and refusal states.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { forgetTabValues, keepTabValue, readTabValue } from "@/lib/tab-storage";
import { LeadsScreen } from "@/leads/list/leads-screen";
import { heldAnswer, stubApi, type Answer } from "../support/api-stub";
import { address } from "./navigation";
import { member } from "../support/members";
import { aListItem, aPage, counts, ids } from "./records";
import { inputsTo, lastInputTo, owner, renderScreen, salesperson } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { list } = messages.leads;
// 11:00 am on Friday 16 October 2026 in India.
const NOW = new Date("2026-10-16T05:30:00Z");

const owners = {
  data: [
    { userId: owner.user.id, name: "Asha Sharma" },
    { userId: salesperson.user.id, name: "Ravi Kumar" },
  ],
};

function renderLeads(answers: Record<string, Answer> = {}, options: Parameters<typeof renderScreen>[1] = {}) {
  const api = stubApi({
    "leads.list": aPage([aListItem()]),
    "leads.counts": { data: counts },
    "leads.owners": owners,
    "destinations.search": { data: [] },
    ...answers,
  });
  renderScreen(<LeadsScreen />, options);
  return api;
}

async function rows(): Promise<HTMLElement[]> {
  return within(await screen.findByRole("list", { name: list.leads })).findAllByRole("listitem");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  address.set("/leads");
  forgetTabValues();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LeadsScreen", () => {
  it("opens on Mine · open, newest first, with Show more", async () => {
    const sneha = aListItem({ id: ids.sneha, person: { name: "Sneha Iyer", phone: null }, stage: "contacted" });
    const api = renderLeads({ "leads.list": aPage([aListItem(), sneha], ids.sneha) });
    expect((await rows()).map((row) => within(row).getByRole("link").textContent)).toEqual([
      expect.stringContaining("Rahul Sharma"),
      expect.stringContaining("Sneha Iyer"),
    ]);
    expect(inputsTo("leads.list")).toEqual([{ view: "mine", stage: "open", limit: 25 }]);
    expect(screen.getByRole("radio", { name: /^Open/ })).toBeChecked();

    api.answer("leads.list", aPage([aListItem({ id: ids.priya, person: { name: "Priya Nair", phone: null } })]));
    await userEvent.click(screen.getByRole("button", { name: list.showMore }));
    expect(await screen.findByText("Priya Nair")).toBeVisible();
    expect(lastInputTo("leads.list")).toEqual({ view: "mine", stage: "open", limit: 25, before: ids.sneha });
    expect(await rows()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: list.showMore })).not.toBeInTheDocument();
  });

  it("gives managers Mine/Everyone tabs and an owner filter, and a salesperson the 'Mine · open' chip", async () => {
    renderLeads();
    const whose = await screen.findByRole("tablist", { name: list.whose });
    expect(within(whose).getByRole("tab", { name: list.mine })).toHaveAttribute("aria-selected", "true");
    // No Unassigned queue until automatic assignment is on (release 4).
    expect(
      within(whose)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual([list.mine, list.everyone]);
    await userEvent.click(within(whose).getByRole("tab", { name: list.everyone }));
    expect(address.href).toBe("/leads?view=everyone");
    await waitFor(() => {
      expect(lastInputTo("leads.list")).toEqual({ view: "everyone", stage: "open", limit: 25 });
    });
    expect(lastInputTo("leads.counts")).toEqual({ view: "everyone" });

    await userEvent.click(screen.getByRole("button", { name: list.filters }));
    const filters = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    await userEvent.click(within(filters).getByRole("combobox", { name: list.filtersDialog.owner }));
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(within(filters).getByRole("button", { name: list.filtersDialog.apply }));
    expect(address.href).toBe(`/leads?view=everyone&owner=${salesperson.user.id}`);
    await waitFor(() => {
      expect(lastInputTo("leads.list")).toEqual({
        view: "everyone",
        stage: "open",
        ownerUserId: salesperson.user.id,
        limit: 25,
      });
    });
  });

  it("says in Filters when the owners didn't load, with Try again", async () => {
    const api = renderLeads({ "leads.owners": { status: 500 } });
    await userEvent.click(await screen.findByRole("button", { name: list.filters }));
    const filters = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    const alert = await within(filters).findByRole("alert");
    expect(alert).toHaveTextContent(messages.leads.ownersFailed);
    api.answer("leads.owners", owners);
    await userEvent.click(within(alert).getByRole("button", { name: messages.common.tryAgain }));
    await waitFor(() => {
      expect(within(filters).queryByRole("alert")).not.toBeInTheDocument();
    });
    // Try again only asked again: the dialog is still open, its choice not applied.
    expect(screen.getByRole("dialog", { name: list.filtersDialog.title })).toBeVisible();
    expect(address.href).toBe("/leads");
    await userEvent.click(within(filters).getByRole("combobox", { name: list.filtersDialog.owner }));
    expect(await screen.findByRole("option", { name: "Ravi Kumar" })).toBeVisible();
  });

  it("gives a salesperson no tabs, no owner filter and the 'Mine · open' chip", async () => {
    address.set(`/leads?view=everyone&owner=${owner.user.id}`);
    renderLeads({}, { me: salesperson });
    expect(await screen.findByRole("radio", { name: /^Mine · open/ })).toBeChecked();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(lastInputTo("leads.list")).toEqual({ view: "mine", stage: "open", limit: 25 });
    await userEvent.click(screen.getByRole("button", { name: list.filters }));
    const filters = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    expect(within(filters).queryByRole("combobox", { name: list.filtersDialog.owner })).not.toBeInTheDocument();
    expect(within(filters).getByRole("combobox", { name: list.filtersDialog.source })).toBeVisible();
  });

  it("shows each open stage's count on its chip", async () => {
    renderLeads();
    const chips = await screen.findByRole("radiogroup", { name: list.chips });
    await waitFor(() => {
      expect(
        within(chips)
          .getAllByRole("radio")
          .map((chip) => chip.textContent),
      ).toEqual(["Open16", "New3", "Contacted5", "Quote sent2", "Booking requested6"]);
    });
    await userEvent.click(within(chips).getByRole("radio", { name: /^Contacted/ }));
    expect(address.href).toBe("/leads?stage=contacted");
    await waitFor(() => {
      expect(lastInputTo("leads.list")).toEqual({ view: "mine", stage: "contacted", limit: 25 });
    });
    expect(within(chips).getByRole("radio", { name: /^Contacted/ })).toBeChecked();
    // The counts are for the same view and filters, whatever the stage.
    // (The Unassigned tab's own count, for whoever assigns leads, is asked apart.)
    expect(inputsTo("leads.counts").filter((input) => (input as { view: string }).view !== "unassigned")).toEqual([
      { view: "mine" },
    ]);
  });

  it("marks each stage chip with its stage's dot, the chosen one with a check instead", async () => {
    address.set("/leads?stage=quote_sent");
    renderLeads();
    const chips = await screen.findByRole("radiogroup", { name: list.chips });
    const dotOf = (name: RegExp) => within(chips).getByRole("radio", { name }).querySelector("span[aria-hidden=true]");
    expect(dotOf(/^Open/)).toBeNull();
    expect(dotOf(/^New/)).toHaveClass("bg-stage-new-dot");
    expect(dotOf(/^Contacted/)).toHaveClass("bg-stage-contacted-dot");
    expect(dotOf(/^Booking requested/)).toHaveClass("bg-stage-booking-requested-dot");
    const chosen = within(chips).getByRole("radio", { name: /^Quote sent/ });
    expect(chosen).toBeChecked();
    expect(chosen.querySelector("span[aria-hidden=true]")).toBeNull();
    expect(chosen.querySelector("svg")).not.toBeNull();
  });

  it("shows each stage in Filters' stage list with its dot", async () => {
    renderLeads();
    await userEvent.click(await screen.findByRole("button", { name: list.filters }));
    const filters = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    await userEvent.click(within(filters).getByRole("combobox", { name: list.filtersDialog.stage }));
    const won = await screen.findByRole("option", { name: messages.leads.stages.won });
    expect(won.querySelector("span[aria-hidden=true]")).toHaveClass("bg-status-good-dot");
    const open = screen.getByRole("option", { name: list.filtersDialog.openStages });
    expect(open.querySelector("span[aria-hidden=true].rounded-full")).toBeNull();
  });

  it("leaves the counts off the chips while there are no leads at all: a row of zeros says nothing", async () => {
    const none = { open: 0, new: 0, contacted: 0, quote_sent: 0, booking_requested: 0 };
    const api = renderLeads({ "leads.list": aPage([]), "leads.counts": { data: none } });
    expect(await screen.findByText(list.empty)).toBeVisible();
    await waitFor(() => {
      expect(api.calls).toContain("leads.counts");
    });
    const chips = screen.getByRole("radiogroup", { name: list.chips });
    expect(
      within(chips)
        .getAllByRole("radio")
        .map((chip) => chip.textContent),
    ).toEqual(["Open", "New", "Contacted", "Quote sent", "Booking requested"]);
  });

  it("searches by name or phone after a pause; the field has a label for screen readers", async () => {
    renderLeads();
    await rows();
    const search = screen.getByRole("searchbox", { name: list.search });
    await userEvent.type(search, "98765 43");
    expect(inputsTo("leads.list")).toHaveLength(1);
    await waitFor(() => {
      expect(lastInputTo("leads.list")).toEqual({ view: "mine", stage: "open", search: "98765 43", limit: 25 });
    });
    expect(lastInputTo("leads.counts")).toEqual({ view: "mine", search: "98765 43" });
    expect(search).toHaveValue("98765 43");
  });

  it("says how many leads a search found, or that it found none, in a polite status for screen readers", async () => {
    const api = renderLeads({ "leads.list": aPage([aListItem()], ids.rahul) });
    await rows();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("1 lead shown, more below");
    api.answer("leads.list", aPage([]));
    await userEvent.type(screen.getByRole("searchbox", { name: list.search }), "zed");
    await waitFor(() => {
      expect(status).toHaveTextContent(list.emptyFiltered);
    });
  });

  it("keeps the search out of every address, and finds it again on the way back from a lead", async () => {
    address.set("/leads?view=everyone");
    renderLeads();
    await rows();
    await userEvent.type(screen.getByRole("searchbox", { name: list.search }), "Rahul 98765");
    await waitFor(() => {
      expect(lastInputTo("leads.list")).toMatchObject({ view: "everyone", search: "Rahul 98765" });
    });
    // Not the page's address, nor a row's link, nor any request's URL (queries are posted, data/trpc.ts).
    expect(address.href).toBe("/leads?view=everyone");
    const links = within(screen.getByRole("list", { name: list.leads })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([`/leads/${ids.rahul}?view=everyone`]);
    const urls = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input)));
    expect(urls.filter((url) => /rahul|98765/i.test(decodeURIComponent(url)))).toEqual([]);

    // Back from the lead, the list opens again with its search.
    cleanup();
    renderLeads();
    expect(await screen.findByRole("searchbox", { name: list.search })).toHaveValue("Rahul 98765");
    await waitFor(() => {
      expect(inputsTo("leads.list").at(-1)).toMatchObject({ view: "everyone", search: "Rahul 98765" });
    });
  });

  it("says 'No results for these filters' with Clear filters, which forgets the search", async () => {
    address.set("/leads?stage=won");
    keepTabValue("leads.search", "zed");
    renderLeads({ "leads.list": aPage([]) });
    // Said to the eye in the list's place, and to screen readers in the status.
    expect(await screen.findAllByText(list.emptyFiltered)).toHaveLength(2);
    expect(screen.getByRole("searchbox", { name: list.search })).toHaveValue("zed");
    await userEvent.click(screen.getByRole("button", { name: list.clearFilters }));
    expect(address.href).toBe("/leads");
    expect(screen.getByRole("searchbox", { name: list.search })).toHaveValue("");
    expect(readTabValue("leads.search")).toBeNull();
    await waitFor(() => {
      expect(lastInputTo("leads.list")).toEqual({ view: "mine", stage: "open", limit: 25 });
    });
    expect(await screen.findByText(list.empty)).toBeVisible();
    expect(screen.getAllByRole("link", { name: messages.leads.newLead }).length).toBeGreaterThan(0);
  });

  it("reads a row: name, ↺ Returning, trip line, stage badge and next step; on a computer the Table's seven columns", async () => {
    const amit = aListItem({
      id: ids.sneha,
      person: { name: "Amit Verma", phone: "+919811045526" },
      returning: true,
      stage: "quote_sent",
      trip: { destinationName: "Manali", when: { kind: "flexible" }, adults: 2, childrenCount: 0 },
      next: {
        awaitingReplySince: null,
        task: { id: ids.task, kind: "follow-up", title: "Send the Manali quote", dueAt: "2026-10-17T05:30:00.000Z" },
      },
    });
    renderLeads({ "leads.list": aPage([amit]) });
    const [row] = await rows();
    if (!row) throw new Error("no row");
    const link = within(row).getByRole("link");
    expect(link).toHaveAttribute("href", `/leads/${ids.sneha}`);
    for (const text of ["Amit Verma", messages.leads.returning, "Manali · dates open · 2 adults", "Quote sent"]) {
      expect(within(link).getByText(text)).toBeVisible();
    }
    expect(within(link).getByText("Follow up tomorrow, 11:00 am")).toBeVisible();
  });

  it("shows the Table's checkbox column and seven columns on a computer, each row's link keeping the list's filters", async () => {
    address.set("/leads?view=everyone");
    renderLeads({}, { width: "wide" });
    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["", ...Object.values(list.columns)]);
    const [, row] = await within(table).findAllByRole("row");
    if (!row) throw new Error("no row");
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "",
      "Rahul Sharma+91 98765 43210",
      "Kashmir · Dec · 2 adults, 1 childPhone call",
      "New",
      "12 min ago · not contacted yet",
      "Asha Sharma",
      "₹60,000per person",
      "16 Oct",
    ]);
    expect(within(row).getByRole("link", { name: "Rahul Sharma" })).toHaveAttribute(
      "href",
      `/leads/${ids.rahul}?view=everyone`,
    );
  });

  it("names the destination the address chose once the agency's list arrives", async () => {
    address.set(`/leads?destination=${ids.goa}`);
    const destinations = heldAnswer({ data: [{ id: ids.goa, name: "Goa" }] });
    renderLeads({ "destinations.search": destinations.answer });
    await userEvent.click(await screen.findByRole("button", { name: list.filtersChosen.replace("{count}", "1") }));
    const filters = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    const picker = within(filters).getByRole("combobox", { name: list.filtersDialog.destination });
    expect(picker).toHaveTextContent(list.filtersDialog.chosen);
    destinations.release();
    await waitFor(() => {
      expect(picker).toHaveTextContent("Goa");
    });
  });

  it("gives the focus back to Filters when its dialog closes", async () => {
    renderLeads();
    const button = await screen.findByRole("button", { name: list.filters });
    await userEvent.click(button);
    const filters = await screen.findByRole("dialog", { name: list.filtersDialog.title });
    await userEvent.click(within(filters).getByRole("button", { name: messages.common.cancel }));
    await waitFor(() => {
      expect(button).toHaveFocus();
    });
  });

  it("says when the chips' counts didn't load, with Try again, and keeps the list", async () => {
    const api = renderLeads({ "leads.counts": { status: 500 } });
    expect(await screen.findByText(list.countsFailed)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(list.countsFailed);
    expect(await rows()).toHaveLength(1);
    api.answer("leads.counts", { data: counts });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    const chips = screen.getByRole("radiogroup", { name: list.chips });
    await waitFor(() => {
      expect(within(chips).getByRole("radio", { name: /^New/ })).toHaveTextContent("New3");
    });
    expect(screen.queryByText(list.countsFailed)).not.toBeInTheDocument();
  });

  it("leads those who may block contacts to Blocked contacts, Settings or not", async () => {
    const assigner = member({ name: "Meera Iyer", permissions: ["leads:view", "leads:create", "leads:assign"] });
    renderLeads({}, { me: assigner });
    await rows();
    expect(screen.getByRole("link", { name: list.blockedContacts })).toHaveAttribute(
      "href",
      "/settings/blocked-contacts",
    );
    cleanup();

    renderLeads({}, { me: salesperson });
    await rows();
    expect(screen.queryByRole("link", { name: list.blockedContacts })).not.toBeInTheDocument();
  });

  it("leaves the Owner column out of a salesperson's table: every lead there is theirs", async () => {
    renderLeads({}, { me: salesperson, width: "wide" });
    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["", ...Object.values(list.columns).filter((column) => column !== list.columns.owner)]);
  });

  it("draws the table's skeleton with as many columns as the table will have: six for a salesperson", async () => {
    renderLeads({ "leads.list": "never" }, { me: salesperson, width: "wide" });
    const loading = await screen.findByRole("status", { name: list.loading });
    expect(within(loading).getAllByRole("columnheader")).toHaveLength(6);
  });

  it("draws seven skeleton columns for a manager, whose table has Owner", async () => {
    renderLeads({ "leads.list": "never" }, { width: "wide" });
    const loading = await screen.findByRole("status", { name: list.loading });
    expect(within(loading).getAllByRole("columnheader")).toHaveLength(7);
  });

  it("shows the skeleton, the error with Try again, and a refusal's sentence", async () => {
    const api = renderLeads({ "leads.list": "never", "leads.counts": "never" });
    expect(await screen.findByRole("status", { name: list.loading })).toBeVisible();
    api.answer("leads.list", "offline");
    api.answer("leads.counts", { data: counts });
    address.set("/leads?stage=new");
    expect(await screen.findByText(list.loadFailed)).toBeVisible();
    api.answer("leads.list", aPage([aListItem()]));
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await rows()).toHaveLength(1);

    api.answer("leads.list", { status: 403, reason: "MODULE_NOT_ON_PLAN" });
    address.set("/leads?stage=contacted");
    expect(await screen.findByText(messages.errors.reasons.MODULE_NOT_ON_PLAN)).toBeVisible();
  });
});
