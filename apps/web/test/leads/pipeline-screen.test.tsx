// The pipeline board (release C): every open lead in its stage's column, and Won; a lead moves with its Move to menu
// or by dragging its card to another column, through the lead page's own leads.moveStage, and a toast says so. Someone
// who may not edit leads can neither drag nor move.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { messages } from "@/i18n/messages";
import { PipelineScreen } from "@/leads/pipeline/pipeline-screen";
import { member } from "../support/members";
import { stubApi } from "../support/api-stub";
import { address } from "./navigation";
import { aListItem, aPage, counts, ids } from "./records";
import { inputsTo, owner, renderScreen } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { pipeline, stages } = messages.leads;
const moveTo = pipeline.moveTo.replace("{name}", "Rahul Sharma");

function renderBoard(me = owner) {
  const api = stubApi({
    "leads.list": aPage([aListItem()]),
    "leads.counts": { data: counts },
    "leads.moveStage": { data: null },
  });
  renderScreen(<PipelineScreen />, { me, width: "wide" });
  return api;
}

/** A column by its stage's name; every column here lists the same lead, as the stub answers every stage alike. */
const column = async (stage: string) => within(await screen.findByRole("group", { name: stage }));

/** A dataTransfer that carries what a drag sets, as the browser's does between the events. */
function aDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "",
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };
}

beforeEach(() => {
  address.set("/leads/pipeline");
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
});

describe("the pipeline board", () => {
  it("lists a column for each open stage and Won, each with its leads", async () => {
    renderBoard();
    for (const stage of ["new", "contacted", "quote_sent", "booking_requested", "won"] as const) {
      expect(await (await column(stages[stage])).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    }
    expect(screen.queryByRole("group", { name: stages.lost })).not.toBeInTheDocument();
  });

  it("moves a lead with its Move to menu, and says so", async () => {
    renderBoard();
    const card = await column(stages.new);
    await userEvent.click(await card.findByRole("button", { name: moveTo }));
    // The menu offers every stage but the lead's own.
    expect(screen.queryByRole("menuitem", { name: stages.new })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("menuitem", { name: stages.quote_sent }));
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "quote_sent" }]);
    });
    expect(
      await screen.findByText(pipeline.moved.replace("{name}", "Rahul Sharma").replace("{stage}", stages.quote_sent)),
    ).toBeVisible();
  });

  it("moves a lead dragged to another column", async () => {
    renderBoard();
    const source = await column(stages.new);
    const card = (await source.findByRole("link", { name: "Rahul Sharma" })).closest<HTMLElement>("[data-slot=item]");
    if (!card) throw new Error("the card is missing");
    expect(card).toHaveAttribute("draggable", "true");
    const dataTransfer = aDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    const target = await screen.findByRole("group", { name: stages.won });
    fireEvent.dragOver(target, { dataTransfer });
    expect(within(target).getByText(pipeline.dropHere.replace("{stage}", stages.won))).toBeVisible();
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "won" }]);
    });
  });

  it("takes nothing but a lead dropped on a column", async () => {
    renderBoard();
    const target = await screen.findByRole("group", { name: stages.won });
    const dataTransfer = aDataTransfer();
    dataTransfer.setData("text/plain", "Rahul Sharma");
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(inputsTo("leads.moveStage")).toEqual([]);
  });

  it("lets someone who may not edit leads neither drag nor move them", async () => {
    renderBoard(member({ permissions: ["leads:view"] }));
    const card = (await (await column(stages.new)).findByRole("link", { name: "Rahul Sharma" })).closest<HTMLElement>(
      "[data-slot=item]",
    );
    expect(card).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("button", { name: moveTo })).not.toBeInTheDocument();
  });
});
