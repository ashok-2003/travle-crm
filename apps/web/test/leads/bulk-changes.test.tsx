// Choosing leads on the list and changing them together (release C): a computer ticks leads, a bar says how many are
// chosen, Move to sends them to a stage in one call and then clears the choice; Assign to is for whoever holds
// leads:assign; a phone has no ticks.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { messages } from "@/i18n/messages";
import { LeadsScreen } from "@/leads/list/leads-screen";
import { forgetTabValues } from "@/lib/tab-storage";
import { stubApi, type Answer } from "../support/api-stub";
import { address } from "./navigation";
import { aListItem, aPage, counts, ids } from "./records";
import { inputsTo, owner, renderScreen, salesperson } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { bulk, stages } = messages.leads;
const sneha = aListItem({ id: ids.sneha, person: { name: "Sneha Iyer", phone: null }, stage: "contacted" });

function renderList(
  options: Parameters<typeof renderScreen>[1] = { width: "wide" },
  answers: Record<string, Answer> = {},
) {
  const api = stubApi({
    "leads.list": aPage([aListItem(), sneha]),
    "leads.counts": { data: counts },
    "leads.owners": { data: [{ userId: owner.user.id, name: "Asha Sharma" }] },
    "destinations.search": { data: [] },
    "leads.bulkMoveStage": { data: { changed: 2, skipped: [] } },
    ...answers,
  });
  renderScreen(<LeadsScreen />, options);
  return api;
}

const choose = async (name: string) => {
  await userEvent.click(await screen.findByRole("checkbox", { name: bulk.choose.replace("{name}", name) }));
};

beforeEach(() => {
  address.set("/leads");
  forgetTabValues();
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
});

describe("changing chosen leads on the list", () => {
  it("shows no bar until a lead is ticked, then how many are chosen", async () => {
    renderList();
    await choose("Rahul Sharma");
    const bar = await screen.findByRole("region", { name: bulk.label });
    expect(within(bar).getByText("1 lead chosen")).toBeVisible();
    await choose("Sneha Iyer");
    expect(within(bar).getByText("2 leads chosen")).toBeVisible();
  });

  it("chooses every lead shown with the header's tick", async () => {
    renderList();
    await userEvent.click(await screen.findByRole("checkbox", { name: bulk.chooseAll }));
    expect(await screen.findByText("2 leads chosen")).toBeVisible();
  });

  it("moves the chosen leads to a stage in one call, says how many changed, and clears the choice", async () => {
    renderList();
    await choose("Rahul Sharma");
    await choose("Sneha Iyer");
    const bar = await screen.findByRole("region", { name: bulk.label });
    await userEvent.click(within(bar).getByRole("button", { name: bulk.moveTo }));
    await userEvent.click(await screen.findByRole("menuitem", { name: stages.quote_sent }));
    await waitFor(() => {
      expect(inputsTo("leads.bulkMoveStage")).toEqual([{ leadIds: [ids.rahul, ids.sneha], stage: "quote_sent" }]);
    });
    expect(await screen.findByText("2 leads changed")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: bulk.label })).not.toBeInTheDocument();
    });
  });

  it("counts the leads the api left as they were", async () => {
    renderList(
      { width: "wide" },
      { "leads.bulkMoveStage": { data: { changed: 1, skipped: [{ leadId: ids.sneha, reason: "NOT_FOUND" }] } } },
    );
    await userEvent.click(await screen.findByRole("checkbox", { name: bulk.chooseAll }));
    await userEvent.click(
      within(await screen.findByRole("region", { name: bulk.label })).getByRole("button", { name: bulk.moveTo }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: stages.won }));
    expect(await screen.findByText("1 lead changed; 1 was left as they were.")).toBeVisible();
  });

  it("clears the choice with Clear", async () => {
    renderList();
    await choose("Rahul Sharma");
    await userEvent.click(await screen.findByRole("button", { name: bulk.clear }));
    expect(screen.queryByRole("region", { name: bulk.label })).not.toBeInTheDocument();
  });

  it("offers Assign to whoever holds leads:assign, and not to a salesperson", async () => {
    renderList();
    await choose("Rahul Sharma");
    expect(await screen.findByRole("button", { name: bulk.assign })).toBeVisible();
    cleanup();

    renderList({ me: salesperson, width: "wide" });
    await choose("Rahul Sharma");
    const bar = await screen.findByRole("region", { name: bulk.label });
    expect(within(bar).getByRole("button", { name: bulk.moveTo })).toBeVisible();
    expect(within(bar).queryByRole("button", { name: bulk.assign })).not.toBeInTheDocument();
  });

  it("has no ticks on a phone", async () => {
    renderList({ width: "phone" });
    await screen.findByRole("list", { name: messages.leads.list.leads });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
