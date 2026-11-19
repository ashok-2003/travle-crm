// The pipeline board (release C, web revamp part 4): every open lead in its stage's column, and Won. A lead moves with
// its Move to menu (a sheet on a phone) or by dragging its card to another column, through the lead page's own
// leads.moveStage, and the move shows at once: the card is in its new column and the counts follow before the api
// answers, a toast says so with Undo, and a refusal puts the card back and says why. A phone shows one stage at a time
// under the stages' chips. Someone who may not edit leads can neither drag nor move.
import type { LeadListItem, LeadStage, MoveStageInput } from "@travel-crm/contracts/crm";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { messages } from "@/i18n/messages";
import { PipelineScreen } from "@/leads/pipeline/pipeline-screen";
import type { SignedInMember } from "@/session/me-context";
import { paidSubscription, type newQueryClient } from "../organization/api";
import { member } from "../support/members";
import { heldAnswer, stubApi, type Answer } from "../support/api-stub";
import { address } from "./navigation";
import { aListItem, aPage, ids } from "./records";
import { inputsTo, owner, renderScreen } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

const { pipeline, stages, trip } = messages.leads;
const moveTo = (name: string) => pipeline.moveTo.replace("{name}", name);
const moved = (name: string, stage: LeadStage) =>
  pipeline.moved.replace("{name}", name).replace("{stage}", stages[stage]);

const rahul = aListItem();
const sneha = aListItem({ id: ids.sneha, person: { name: "Sneha Iyer", phone: null }, stage: "contacted" });

/** The leads by stage, as the api keeps them. */
type Board = Partial<Record<LeadStage, LeadListItem[]>>;

/** Moves a lead on the board as the api does: out of its stage, to the top of the new one. */
function moveOn(board: Board, { leadId, stage }: MoveStageInput) {
  const lead = Object.values(board)
    .flat()
    .find((item) => item.id === leadId);
  for (const [key, items] of Object.entries(board))
    board[key as LeadStage] = items.filter((item) => item.id !== leadId);
  if (lead) board[stage] = [{ ...lead, stage }, ...(board[stage] ?? [])];
}

/** leads.moveStage moving the lead on the board at once. */
const moves =
  (board: Board): ((input: unknown) => Answer) =>
  (input) => {
    moveOn(board, input as MoveStageInput);
    return { data: null };
  };

/** leads.moveStage answering only once the test releases it, and moving the lead on the board then. */
function heldMove(board: Board) {
  let release: () => void = () => undefined;
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  const answer: Answer = (input) => {
    void until.then(() => {
      moveOn(board, input as MoveStageInput);
    });
    return { until, then: { data: null } };
  };
  return {
    answer,
    release: () => {
      release();
    },
  };
}

function renderBoard({
  board = { new: [rahul], contacted: [sneha] },
  move = moves(board),
  me = owner,
  width = "wide",
  subscription,
}: {
  board?: Board;
  move?: Answer;
  me?: SignedInMember;
  width?: "phone" | "wide";
  subscription?: Parameters<typeof newQueryClient>[0];
} = {}) {
  const count = (stage: LeadStage) => board[stage]?.length ?? 0;
  const api = stubApi({
    "leads.list": (input) => aPage(board[(input as { stage: LeadStage }).stage] ?? []),
    "leads.counts": () => ({
      data: {
        open: count("new") + count("contacted") + count("quote_sent") + count("booking_requested"),
        new: count("new"),
        contacted: count("contacted"),
        quote_sent: count("quote_sent"),
        booking_requested: count("booking_requested"),
      },
    }),
    "leads.moveStage": move,
  });
  renderScreen(<PipelineScreen />, { me, width, subscription });
  return api;
}

/** A column by its stage's name. */
const column = async (stage: LeadStage) => within(await screen.findByRole("group", { name: stages[stage] }));

/** The leads a column's heading counts, after the stage's name. */
const countIn = async (stage: LeadStage) =>
  (await screen.findByRole("group", { name: stages[stage] }))
    .querySelector("[data-slot=card-title]")
    ?.textContent.replace(stages[stage], "");

const cardOf = (link: HTMLElement) => {
  const card = link.closest<HTMLElement>("[data-slot=item]");
  if (!card) throw new Error("the card is missing");
  return card;
};

/** Moves a lead with its card's Move to menu. */
async function moveWithMenu(name: string, from: LeadStage, to: LeadStage) {
  await userEvent.click(await (await column(from)).findByRole("button", { name: moveTo(name) }));
  await userEvent.click(await screen.findByRole("menuitem", { name: stages[to] }));
}

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
  it("lists a column for each open stage and Won, each with its leads and its count", async () => {
    renderBoard();
    for (const stage of ["new", "contacted", "quote_sent", "booking_requested", "won"] as const) {
      expect(await screen.findByRole("group", { name: stages[stage] })).toBeVisible();
    }
    expect(await (await column("new")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(await (await column("contacted")).findByRole("link", { name: "Sneha Iyer" })).toBeVisible();
    await waitFor(async () => {
      expect(await countIn("contacted")).toBe("1");
    });
    expect(screen.queryByRole("group", { name: stages.lost })).not.toBeInTheDocument();
  });

  it("moves a card at once, before the api answers, with the counts, and says so", async () => {
    const board: Board = { new: [rahul], contacted: [sneha] };
    const move = heldMove(board);
    renderBoard({ board, move: move.answer });
    await waitFor(async () => {
      expect(await countIn("new")).toBe("1");
    });
    await userEvent.click(await (await column("new")).findByRole("button", { name: moveTo("Rahul Sharma") }));
    // The menu offers every stage but the lead's own.
    expect(screen.queryByRole("menuitem", { name: stages.new })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("menuitem", { name: stages.contacted }));
    // The api hasn't answered: the card is in Contacted already, on top, and out of New.
    const contacted = await column("contacted");
    expect(await contacted.findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(contacted.getAllByRole("link").map((link) => link.textContent)).toEqual(["Rahul Sharma", "Sneha Iyer"]);
    expect((await column("new")).queryByRole("link", { name: "Rahul Sharma" })).not.toBeInTheDocument();
    expect(await countIn("new")).toBe("0");
    expect(await countIn("contacted")).toBe("2");
    expect(await screen.findByText(moved("Rahul Sharma", "contacted"))).toBeVisible();
    expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "contacted" }]);
    const listed = inputsTo("leads.list").length;
    move.release();
    // Once it has, the columns load again quietly and the card stays where it went.
    await waitFor(() => {
      expect(inputsTo("leads.list").length).toBeGreaterThan(listed);
    });
    expect(await (await column("contacted")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(await countIn("contacted")).toBe("2");
  });

  it("puts a refused card back where it was and says why", async () => {
    const refusal = heldAnswer({ status: 409, reason: "LEAD_HAS_SALES" });
    renderBoard({ move: refusal.answer });
    await waitFor(async () => {
      expect(await countIn("new")).toBe("1");
    });
    await moveWithMenu("Rahul Sharma", "new", "won");
    expect(await (await column("won")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(await countIn("new")).toBe("0");
    refusal.release();
    expect(await screen.findByText(messages.errors.reasons.LEAD_HAS_SALES)).toBeVisible();
    expect(await (await column("new")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect((await column("won")).queryByRole("link", { name: "Rahul Sharma" })).not.toBeInTheDocument();
    expect(await countIn("new")).toBe("1");
  });

  it("moves a card back with the toast's Undo, the same instant way", async () => {
    renderBoard();
    await moveWithMenu("Rahul Sharma", "new", "quote_sent");
    expect(await (await column("quote_sent")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    await userEvent.click(await screen.findByRole("button", { name: pipeline.undo }));
    expect(await (await column("new")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect((await column("quote_sent")).queryByRole("link", { name: "Rahul Sharma" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([
        { leadId: ids.rahul, stage: "quote_sent" },
        { leadId: ids.rahul, stage: "new" },
      ]);
    });
    expect(await countIn("new")).toBe("1");
    expect(await countIn("quote_sent")).toBe("0");
  });

  it("sends two quick moves of a card in the order they were made, and keeps it where the last put it", async () => {
    const board: Board = { new: [rahul], contacted: [sneha] };
    const first = heldMove(board);
    let made = 0;
    renderBoard({ board, move: (input) => (made++ === 0 ? first.answer : moves(board))(input) });
    await moveWithMenu("Rahul Sharma", "new", "contacted");
    await moveWithMenu("Rahul Sharma", "contacted", "booking_requested");
    expect(await (await column("booking_requested")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    // The second waits for the first.
    expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "contacted" }]);
    const listed = inputsTo("leads.list").length;
    first.release();
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([
        { leadId: ids.rahul, stage: "contacted" },
        { leadId: ids.rahul, stage: "booking_requested" },
      ]);
    });
    await waitFor(() => {
      expect(inputsTo("leads.list").length).toBeGreaterThan(listed);
    });
    expect(board.booking_requested?.map((lead) => lead.id)).toEqual([ids.rahul]);
    expect(await (await column("booking_requested")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect((await column("contacted")).queryByRole("link", { name: "Rahul Sharma" })).not.toBeInTheDocument();
  });

  it("leaves a card where a later move put it when an earlier move of it is refused", async () => {
    const board: Board = { new: [rahul], contacted: [sneha] };
    const refusal = heldAnswer({ status: 409, reason: "LEAD_HAS_SALES" });
    const second = heldMove(board);
    let made = 0;
    renderBoard({ board, move: (input) => (made++ === 0 ? refusal.answer : second.answer(input)) });
    await moveWithMenu("Rahul Sharma", "new", "won");
    await moveWithMenu("Rahul Sharma", "won", "booking_requested");
    refusal.release();
    expect(await screen.findByText(messages.errors.reasons.LEAD_HAS_SALES)).toBeVisible();
    // The later move's own answer decides: the card doesn't jump back to New meanwhile.
    expect(await (await column("booking_requested")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect((await column("new")).queryByRole("link", { name: "Rahul Sharma" })).not.toBeInTheDocument();
    second.release();
    await waitFor(() => {
      expect(board.booking_requested?.map((lead) => lead.id)).toEqual([ids.rahul]);
    });
    expect(await (await column("booking_requested")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
  });

  it("takes a lead moved to Lost off the board at once", async () => {
    renderBoard({ move: heldMove({}).answer });
    await waitFor(async () => {
      expect(await countIn("new")).toBe("1");
    });
    await moveWithMenu("Rahul Sharma", "new", "lost");
    await waitFor(async () => {
      expect(await countIn("new")).toBe("0");
    });
    expect(screen.queryByRole("link", { name: "Rahul Sharma" })).not.toBeInTheDocument();
  });

  it("moves a lead dragged to another column at once", async () => {
    renderBoard({ move: heldMove({}).answer });
    const card = cardOf(await (await column("new")).findByRole("link", { name: "Rahul Sharma" }));
    expect(card).toHaveAttribute("draggable", "true");
    const dataTransfer = aDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    const target = await screen.findByRole("group", { name: stages.won });
    fireEvent.dragOver(target, { dataTransfer });
    const hint = pipeline.dropHere.replace("{stage}", stages.won);
    expect(within(target).getByText(hint)).toBeVisible();
    // Passing over the column's own parts keeps the hint, so nothing under it jumps.
    // (jsdom has no DragEvent, so the leave is a MouseEvent, which carries where the pointer went.)
    fireEvent(target, new MouseEvent("dragleave", { bubbles: true, relatedTarget: within(target).getByText(hint) }));
    expect(within(target).getByText(hint)).toBeVisible();
    fireEvent.drop(target, { dataTransfer });
    expect(await within(target).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "won" }]);
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

  it("shows a card's trip only when the lead has trip details", async () => {
    const noTrip = aListItem({
      trip: { destinationName: null, when: { kind: "unknown" }, adults: null, childrenCount: 0 },
    });
    renderBoard({ board: { new: [noTrip], contacted: [sneha] } });
    expect(await (await column("contacted")).findByText("Kashmir · Dec · 2 adults, 1 child")).toBeVisible();
    expect(await (await column("new")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(screen.queryByText(trip.none)).not.toBeInTheDocument();
  });

  it("lets what's next take a second line rather than cut its day and time", async () => {
    renderBoard();
    const next = await (await column("new")).findByText(/not contacted yet/);
    expect(next.parentElement).toHaveClass("line-clamp-2");
    expect(next.parentElement).not.toHaveClass("truncate");
  });

  it("shows each card's owner, as their initials, in Everyone's view only", async () => {
    renderBoard();
    const ownedBy = pipeline.ownedBy.replace("{name}", "Asha Sharma");
    expect(await (await column("new")).findByRole("link", { name: "Rahul Sharma" })).toBeVisible();
    expect(screen.queryByText(ownedBy)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: messages.leads.list.everyone }));
    const card = cardOf(await (await column("new")).findByRole("link", { name: "Rahul Sharma" }));
    expect(within(card).getByText(ownedBy)).toBeInTheDocument();
    expect(within(card).getByText("AS")).toBeVisible();
  });

  it("lets someone who may not edit leads neither drag nor move them", async () => {
    renderBoard({ me: member({ permissions: ["leads:view"] }) });
    const card = cardOf(await (await column("new")).findByRole("link", { name: "Rahul Sharma" }));
    expect(card).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("button", { name: moveTo("Rahul Sharma") })).not.toBeInTheDocument();
  });

  it("turns drag and Move to off in a read-only agency, with the subscription's sentence", async () => {
    const api = renderBoard({ subscription: { ...paidSubscription, status: "read_only", access: "read_only" } });
    const source = await column("new");
    const link = await source.findByRole("link", { name: "Rahul Sharma" });
    expect(cardOf(link)).toHaveAttribute("draggable", "false");
    const move = await source.findByRole("button", { name: moveTo("Rahul Sharma") });
    expect(move).toBeDisabled();
    expect(move).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
    // A card dropped on a column moves nothing either.
    const dataTransfer = aDataTransfer();
    dataTransfer.setData("application/x-lead", JSON.stringify({ id: ids.rahul, name: "Rahul Sharma" }));
    fireEvent.drop(await screen.findByRole("group", { name: stages.won }), { dataTransfer });
    expect(inputsTo("leads.moveStage")).toEqual([]);
    expect(api.calls).not.toContain("leads.moveStage");
  });
});

describe("the pipeline on a phone", () => {
  it("shows the stages as chips with their counts, and one stage's cards at a time", async () => {
    renderBoard({ width: "phone" });
    const chips = await screen.findByRole("radiogroup", { name: pipeline.stages });
    await waitFor(() => {
      expect(
        within(chips)
          .getAllByRole("radio")
          .map((chip) => chip.textContent),
      ).toEqual(["New1", "Contacted1", "Quote sent0", "Booking requested0", "Won"]);
    });
    expect(within(chips).getByRole("radio", { name: /^New/ })).toBeChecked();
    // No dragging with a thumb.
    const card = cardOf(await (await column("new")).findByRole("link", { name: "Rahul Sharma" }));
    expect(card).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("group", { name: stages.contacted })).not.toBeInTheDocument();
    await userEvent.click(within(chips).getByRole("radio", { name: /^Contacted/ }));
    expect(await (await column("contacted")).findByRole("link", { name: "Sneha Iyer" })).toBeVisible();
    expect(screen.queryByRole("group", { name: stages.new })).not.toBeInTheDocument();
  });

  it("moves a card from a bottom sheet of the stages, at once", async () => {
    renderBoard({ width: "phone", move: heldMove({}).answer });
    const chips = await screen.findByRole("radiogroup", { name: pipeline.stages });
    await waitFor(() => {
      expect(within(chips).getByRole("radio", { name: /^New/ })).toHaveTextContent("New1");
    });
    await userEvent.click(await (await column("new")).findByRole("button", { name: moveTo("Rahul Sharma") }));
    const sheet = await screen.findByRole("dialog", { name: moveTo("Rahul Sharma") });
    expect(within(sheet).queryByRole("button", { name: stages.new })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: stages.quote_sent }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Rahul Sharma" })).not.toBeInTheDocument();
    expect(within(chips).getByRole("radio", { name: /^New/ })).toHaveTextContent("New0");
    expect(within(chips).getByRole("radio", { name: /^Quote sent/ })).toHaveTextContent("Quote sent1");
    expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "quote_sent" }]);
  });
});
