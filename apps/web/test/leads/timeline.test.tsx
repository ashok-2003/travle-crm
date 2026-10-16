// A lead's timeline (spec 3.4, R36): what happened, newest first, a page at a time, each kind as its sentence with
// who did it and when in the agency's zone; Add a note puts one at the top.
import type { TimelineEntry } from "@travel-crm/contracts/crm";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { Timeline } from "@/leads/lead/timeline";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aLead, anEntry, aTimeline, ids } from "./records";
import { inputsTo, lastInputTo, owner, renderScreen } from "./screen";

const { timeline: words } = messages.leads.lead;
const NOW = new Date("2026-10-16T05:30:00Z");

const entryId = (index: number) => `0199e7a0-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`;
const task = { kind: "follow-up", title: "Send the Kashmir options", dueAt: "2026-10-17T05:30:00.000Z" } as const;

function entries(): TimelineEntry[] {
  return [
    anEntry({ kind: "note", body: "Wants one night on a houseboat." }),
    anEntry({ kind: "reassigned", ownerUserId: owner.user.id }),
    anEntry({ kind: "stage-changed", stage: "contacted" }),
    anEntry({ kind: "follow-up-added", task }),
    anEntry({ kind: "follow-up-done", task }),
    anEntry({ kind: "follow-up-cancelled", task: { ...task, kind: "task", title: "Ask for passports" } }),
    anEntry({
      kind: "repeat-enquiry",
      enquiry: {
        source: "instagram",
        sourceDetail: null,
        note: "Now thinking of Goa",
        trip: {
          ...aLead().trip,
          destination: { id: ids.goa, name: "Goa" },
          when: { kind: "month", month: "2027-01" },
          childrenAges: [],
        },
      },
    }),
    anEntry({ kind: "trip-edited", actorUserId: null }),
    anEntry({ kind: "created", source: "phone_call" }),
  ].map((entry, index) => ({ ...entry, id: entryId(index) }));
}

/** Each entry's sentence, in the order shown. */
async function sentences(): Promise<string[]> {
  const list = await screen.findByRole("list", { name: words.title });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("heading").textContent);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Timeline", () => {
  it("pages the timeline newest first; Add note adds one at the top; each kind reads as its sentence", async () => {
    const api = stubApi({ "leads.timeline": aTimeline(entries(), entryId(8)), "leads.addNote": { data: null } });
    renderScreen(<Timeline lead={aLead()} />);
    expect(await sentences()).toEqual([
      words.note,
      words.reassigned.replace("{name}", "Asha Sharma"),
      words.moved.replace("{stage}", messages.leads.stages.contacted),
      words.followUpAdded,
      words.followUpDone,
      words.taskCancelled,
      words.repeatEnquiry,
      words.tripEdited,
      words.createdFrom.phone_call,
    ]);
    const list = screen.getByRole("list", { name: words.title });
    const [note, , , added, , , enquiry, edited] = within(list).getAllByRole("listitem");
    expect(note).toHaveTextContent("Ravi Kumar · 16 Oct, 10:42 am");
    expect(note).toHaveTextContent("Wants one night on a houseboat.");
    expect(added).toHaveTextContent("Send the Kashmir options · due 17 Oct, 11:00 am");
    expect(enquiry).toHaveTextContent("Goa · Jan 2027 · 2 adults");
    expect(enquiry).toHaveTextContent("Instagram");
    expect(enquiry).toHaveTextContent("Now thinking of Goa");
    expect(edited).toHaveTextContent(words.system);
    expect(inputsTo("leads.timeline")).toEqual([{ leadId: ids.rahul }]);

    api.answer("leads.timeline", aTimeline([anEntry({ id: entryId(20), kind: "created", source: "walk_in" })]));
    await userEvent.click(screen.getByRole("button", { name: words.showMore }));
    await waitFor(() => {
      expect(lastInputTo("leads.timeline")).toEqual({ leadId: ids.rahul, before: entryId(8) });
    });
    expect(await screen.findByText(words.createdFrom.walk_in)).toBeVisible();

    api.answer(
      "leads.timeline",
      aTimeline([anEntry({ id: entryId(30), kind: "note", body: "Called back" }), ...entries()]),
    );
    await userEvent.type(screen.getByLabelText(words.addNote), "Called back");
    await userEvent.click(screen.getByRole("button", { name: words.saveNote }));
    await waitFor(() => {
      expect(inputsTo("leads.addNote")).toEqual([{ leadId: ids.rahul, body: "Called back" }]);
    });
    await waitFor(() => {
      expect(within(screen.getByRole("list", { name: words.title })).getAllByRole("listitem")[0]).toHaveTextContent(
        "Called back",
      );
    });
    expect(screen.getByLabelText(words.addNote)).toHaveValue("");
  });

  it("asks for the note's words before sending, and offers no note to someone who can't edit leads", async () => {
    stubApi({ "leads.timeline": aTimeline(entries()) });
    const { unmount } = renderScreen(<Timeline lead={aLead()} />);
    await userEvent.click(await screen.findByRole("button", { name: words.saveNote }));
    expect(await screen.findByText(words.problems.required)).toBeVisible();
    expect(inputsTo("leads.addNote")).toEqual([]);
    unmount();

    renderScreen(<Timeline lead={aLead()} />, { me: member({ permissions: ["leads:view"] }) });
    expect(await sentences()).toHaveLength(9);
    expect(screen.queryByLabelText(words.addNote)).not.toBeInTheDocument();
  });

  it("says when the timeline didn't load, with Try again", async () => {
    const api = stubApi({ "leads.timeline": "offline" });
    renderScreen(<Timeline lead={aLead()} />);
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("leads.timeline", aTimeline(entries()));
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await sentences()).toHaveLength(9);
  });

  it("shows two lines that read alike, each once, without a clash", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const enquiry = anEntry({
      kind: "repeat-enquiry",
      enquiry: { source: "other", sourceDetail: null, note: "Other", trip: { ...aLead().trip, destination: null } },
    });
    stubApi({ "leads.timeline": aTimeline([enquiry]) });
    renderScreen(<Timeline lead={aLead()} />);
    expect(await sentences()).toEqual([words.repeatEnquiry]);
    expect(screen.getAllByText("Other")).toHaveLength(2);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    errors.mockRestore();
  });

  it("holds the note box while the note is being sent", async () => {
    const sending = heldAnswer({ data: null });
    stubApi({ "leads.timeline": aTimeline(entries()), "leads.addNote": sending.answer });
    renderScreen(<Timeline lead={aLead()} />);
    const box = await screen.findByLabelText(words.addNote);
    await userEvent.type(box, "Called back");
    await userEvent.click(screen.getByRole("button", { name: words.saveNote }));
    await waitFor(() => {
      expect(box).toBeDisabled();
    });
    sending.release();
    await waitFor(() => {
      expect(box).toBeEnabled();
    });
    expect(box).toHaveValue("");
  });
});
