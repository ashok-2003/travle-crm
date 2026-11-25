// "Tell the AI what changed": the box, the questions, the table, Apply N changes, Undo all, and who sees it.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiChangesCard } from "@/packages/ai-changes/ai-changes-card";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { heldAnswer, stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import {
  aiQueryClient,
  flaggedChange,
  packageId,
  priceChange,
  proposal,
  runId,
  seatsChange,
} from "./ai-changes-support";

vi.mock("@/files/upload", () => ({ uploadFile: vi.fn(() => Promise.resolve()) }));

const words = messages.packages.aiChanges;
const editor = member({ permissions: ["ai:suggest", "quotes:edit"] });
const slot = {
  recordId: "0190a000-0000-7000-8000-0000000000b1",
  attachmentId: "0190a000-0000-7000-8000-0000000000b2",
  upload: {},
};

function render(answers: Record<string, Answer>, client = aiQueryClient(), me = editor) {
  const api = stubApi({ "ai.packageChanges.latest": { data: null }, ...answers });
  renderWithApi(<AiChangesCard packageId={packageId} />, client, me);
  return { api, client };
}
const inputsTo = (path: string) => {
  const sent = vi.mocked(globalThis.fetch).mock.calls.flatMap(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const paths = decodeURIComponent(url.pathname.slice("/api/trpc/".length)).split(",");
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>;
    return paths.flatMap((called, index) => (called === path ? [body[String(index)]] : []));
  });
  return sent;
};
const show = async (text = "Double is 13000 from 1 Dec") => {
  await userEvent.type(await screen.findByRole("textbox", { name: words.textLabel }), text);
  await userEvent.click(screen.getByRole("button", { name: words.show }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the AI changes card", () => {
  it("is not there without the permissions, the AI module or the agency's switch", () => {
    render({}, aiQueryClient(), member({ permissions: ["quotes:edit"] }));
    expect(screen.queryByText(words.title)).toBeNull();
  });

  it("is not there when the plan has no AI", () => {
    render({}, newQueryClient({ ...paidSubscription, modules: ["crm"] }));
    expect(screen.queryByText(words.title)).toBeNull();
  });

  it("offers a text box, Attach and Show the changes", async () => {
    render({});
    expect(await screen.findByRole("textbox", { name: words.textLabel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: words.attach })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: words.show })).toBeDisabled();
  });

  it("says it is working, with the button busy, then lists the changes", async () => {
    const held = heldAnswer({ data: proposal([priceChange]) });
    const { api } = render({ "ai.packageChanges.propose": held.answer });
    await show();
    const busy = await screen.findByRole("button", { name: words.working });
    expect(busy).toBeDisabled();
    held.release();
    expect(await screen.findByRole("table", { name: words.tableLabel })).toBeInTheDocument();
    expect(inputsTo("ai.packageChanges.propose")).toEqual([
      { packageId, text: "Double is 13000 from 1 Dec", attachmentIds: [], answers: [] },
    ]);
    expect(api.calls).toContain("ai.packageChanges.propose");
  });

  it("uploads a photo first and sends its attachment", async () => {
    render({
      "ai.packageChanges.requestInput": { data: slot },
      "ai.packageChanges.confirmInput": { data: {} },
      "ai.packageChanges.propose": { data: proposal([priceChange]) },
    });
    const picker = await screen.findByLabelText(words.attach, { selector: "input" });
    await userEvent.upload(picker, new File(["x"], "rates.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: words.show }));
    await screen.findByRole("table");
    expect(inputsTo("ai.packageChanges.requestInput")).toEqual([{ contentType: "image/png", sizeBytes: 1 }]);
    expect((inputsTo("ai.packageChanges.propose")[0] as { attachmentIds: string[] }).attachmentIds).toEqual([
      slot.attachmentId,
    ]);
  });

  it("asks its questions as choices and a box, and answering runs again", async () => {
    const asked = proposal([], { questions: [{ id: "q1", text: "Which Regular?", choices: ["Summer", "Winter"] }] });
    const { api } = render({ "ai.packageChanges.propose": { data: asked } });
    await show();
    await userEvent.click(await screen.findByRole("radio", { name: "Winter" }));
    api.answer("ai.packageChanges.propose", { data: proposal([priceChange]) });
    await userEvent.click(screen.getByRole("button", { name: words.answer }));
    await screen.findByRole("table");
    expect((inputsTo("ai.packageChanges.propose")[1] as { answers: unknown }).answers).toEqual([
      { questionId: "q1", answer: "Winter" },
    ]);
  });

  it("lists the lines about other trips it left out", async () => {
    render({ "ai.packageChanges.propose": { data: proposal([priceChange], { ignored: ["Kasol 5N from 9000"] }) } });
    await show();
    expect(await screen.findByText(words.ignoredTitle)).toBeInTheDocument();
    expect(screen.getByText("Kasol 5N from 9000")).toBeInTheDocument();
  });

  it("applies the ticked changes, says how many, and refreshes the trip", async () => {
    const { api, client } = render({
      "ai.packageChanges.propose": { data: proposal([priceChange, flaggedChange, seatsChange]) },
      "ai.packageChanges.applyChanges": { data: { applied: 2 } },
    });
    const refreshed = vi.spyOn(client, "invalidateQueries");
    await show();
    await userEvent.click(await screen.findByRole("button", { name: "Apply 2 changes" }));
    expect(await screen.findByText("2 changes applied")).toBeInTheDocument();
    expect(inputsTo("ai.packageChanges.applyChanges")).toEqual([{ runId, changeIds: ["c1", "c3"] }]);
    expect(screen.getByRole("button", { name: words.undoAll })).toBeInTheDocument();
    expect(screen.getByText("Prices for Regular")).toBeInTheDocument();
    const keys = refreshed.mock.calls.map(([filter]) => JSON.stringify(filter?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([expect.stringContaining("packages"), expect.stringContaining("departures")]),
    );
    expect(api.calls).toContain("ai.packageChanges.applyChanges");
  });

  it("asks before Undo all, then says what was undone and which departures stayed", async () => {
    render({
      "ai.packageChanges.propose": { data: proposal([priceChange]) },
      "ai.packageChanges.applyChanges": { data: { applied: 1 } },
      "ai.packageChanges.undo": {
        data: {
          undone: 1,
          kept: [
            {
              departureId: flaggedChange.kind === "departure_cancel" ? flaggedChange.departureId : "",
              startDate: "2027-12-12",
              reason: "has_bookings",
            },
          ],
        },
      },
    });
    await show();
    await userEvent.click(await screen.findByRole("button", { name: "Apply 1 change" }));
    await userEvent.click(await screen.findByRole("button", { name: words.undoAll }));
    const dialog = await screen.findByRole("alertdialog");
    expect(inputsTo("ai.packageChanges.undo")).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: words.undoAll }));
    expect(await screen.findByText("1 change undone")).toBeInTheDocument();
    expect(inputsTo("ai.packageChanges.undo")).toEqual([{ runId }]);
    expect(screen.getByText(words.keptTitle)).toBeInTheDocument();
    expect(screen.getByText("12 Dec 2027: it has bookings")).toBeInTheDocument();
  });

  it("offers Undo all for a run applied earlier", async () => {
    render({
      "ai.packageChanges.latest": { data: { runId, appliedAt: new Date().toISOString(), applied: 3, undoable: true } },
    });
    expect(await screen.findByText("3 changes applied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: words.undoAll })).toBeInTheDocument();
  });

  it("shows a refusal", async () => {
    render({ "ai.packageChanges.propose": { status: 409, reason: "AI_NOT_READY" } });
    await show();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
