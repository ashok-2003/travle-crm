// A lead's timeline (spec 3.4, R36; the lead page's revamp, 2026-11-21): what happened, newest first, a page at a time,
// grouped under its days (Today, Yesterday, 6 Nov) in the agency's zone, each kind as its sentence with a mark in its
// kind's colour, who did it beside it and its time; filters for the AI's entries and for calls and chats; a note cut
// to three lines with More; Add a note, one line until used, puts one at the top. On a computer the entries scroll in
// their own box; in one column the newest five show, then Show more.
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

/** The timeline's card. */
const card = () => screen.getByRole("region", { name: words.title });

/** Each entry's row, in the order shown. */
async function rows(): Promise<HTMLElement[]> {
  await screen.findAllByRole("heading", { level: 4 });
  return within(card()).getAllByRole("listitem");
}

/** Each entry's sentence, in the order shown. */
async function sentences(): Promise<string[]> {
  return (await rows()).map((item) => within(item).getByRole("heading", { level: 4 }).textContent);
}

/** Opens the note box, which is one line until used. */
async function openNoteBox() {
  const box = await screen.findByLabelText(words.addNote);
  await userEvent.click(box);
  return box;
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
    const [note, , , added, , , enquiry, edited] = await rows();
    // Under today's heading, each with its time alone, and who did it beside what they did.
    expect(within(card()).getByRole("heading", { level: 3, name: words.today })).toBeVisible();
    expect(note).toHaveTextContent("Note · Ravi Kumar10:42 am");
    expect(note).toHaveTextContent("Wants one night on a houseboat.");
    expect(added).toHaveTextContent("Send the Kashmir options · due 17 Oct, 11:00 am");
    expect(enquiry).toHaveTextContent("Goa · Jan 2027 · 2 adults");
    expect(enquiry).toHaveTextContent("Instagram");
    expect(enquiry).toHaveTextContent("Now thinking of Goa");
    // The system's own entries are smaller and grey, and never say "The system".
    expect(edited).toHaveTextContent(`${words.tripEdited}10:42 am`);
    expect(edited).not.toHaveTextContent("The system");
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
    await userEvent.type(await openNoteBox(), "Called back");
    await userEvent.click(screen.getByRole("button", { name: words.saveNote }));
    await waitFor(() => {
      expect(inputsTo("leads.addNote")).toEqual([{ leadId: ids.rahul, body: "Called back" }]);
    });
    await waitFor(() => {
      expect(within(card()).getAllByRole("listitem")[0]).toHaveTextContent("Called back");
    });
    expect(screen.getByLabelText(words.addNote)).toHaveValue("");
  });

  it("says what the AI set or changed, and that it was the AI, in its violet", async () => {
    stubApi({
      "leads.timeline": aTimeline([
        anEntry({ kind: "ai-field-set", actorUserId: null, field: "adults", from: "3", to: "4" }),
        anEntry({ kind: "ai-field-set", actorUserId: null, field: "departure_city", from: null, to: "Delhi" }),
        anEntry({ kind: "stage-changed", actorUserId: null, stage: "quote_sent", byAi: true }),
        anEntry({ kind: "stage-changed", stage: "contacted", byAi: false }),
      ]),
    });
    renderScreen(<Timeline lead={aLead()} />);
    expect(await sentences()).toEqual([
      "AI Adults changed from 3 to 4",
      "AI Joining from set to Delhi",
      `${messages.ai.chip} ${words.moved.replace("{stage}", messages.leads.stages.quote_sent)}`,
      words.moved.replace("{stage}", messages.leads.stages.contacted),
    ]);
    const marks = (await rows()).map((item) => item.querySelector("[data-mark]"));
    for (const mark of marks.slice(0, 3)) expect(mark).toHaveClass("bg-people-tint", "text-people-tint-ink");
    expect(marks[3]).toHaveClass("bg-stage-contacted-fill");
  });

  it("marks each kind in its colour: calls blue, chats teal, stages theirs, follow-ups amber, green or grey", async () => {
    stubApi({
      "leads.timeline": aTimeline(
        [
          ...entries(),
          anEntry({ kind: "call", callId: ids.task, outcome: "spoke", note: null }),
          anEntry({ kind: "whatsapp-contact" }),
          anEntry({ kind: "booking-event", bookingId: ids.task, number: "B-1", event: "payment-confirmed" }),
        ].map((entry, index) => ({ ...entry, id: entryId(index) })),
      ),
    });
    renderScreen(<Timeline lead={aLead()} />);
    const marks = Object.fromEntries(
      (await rows()).map((item) => [
        within(item).getByRole("heading", { level: 4 }).textContent,
        item.querySelector("[data-mark]")?.querySelector("span")?.className ??
          item.querySelector("[data-mark]")?.className,
      ]),
    );
    expect(marks[words.note]).toContain("bg-muted");
    expect(marks[words.moved.replace("{stage}", messages.leads.stages.contacted)]).toContain("bg-stage-contacted-fill");
    expect(marks[words.followUpAdded]).toContain("bg-status-attention-fill");
    expect(marks[words.followUpDone]).toContain("bg-status-good-fill");
    expect(marks[words.taskCancelled]).toContain("bg-status-neutral-fill");
    expect(marks[words.repeatEnquiry]).toContain("bg-stage-contacted-fill");
    // Calls wear the action blue's tint: sky is the trip's.
    expect(marks[words.call.replace("{outcome}", "Spoke")]).toContain("bg-action-tint");
    expect(marks[words.whatsappContact]).toContain("bg-stage-contacted-fill");
    expect(marks[words.booking["payment-confirmed"].replace("{number}", "B-1")]).toContain("bg-status-good-fill");
    // The system's own entries: a small grey dot, and a caption-sized title.
    expect(marks[words.tripEdited]).toContain("bg-status-neutral-dot");
    expect(marks[words.createdFrom.phone_call]).toContain("bg-status-neutral-dot");
    const edited = (await rows()).find((item) => item.textContent.includes(words.tripEdited));
    expect(edited?.querySelector(".text-caption")).not.toBeNull();
  });

  it("groups the entries under Today, Yesterday and the day, in the agency's zone", async () => {
    stubApi({
      "leads.timeline": aTimeline([
        anEntry({ id: entryId(0), kind: "note", body: "Today's", occurredAt: "2026-10-16T05:00:00.000Z" }),
        // 11:45 pm on the 15th in India, though the 16th in UTC.
        anEntry({ id: entryId(1), kind: "note", body: "Late last night", occurredAt: "2026-10-15T18:15:00.000Z" }),
        anEntry({ id: entryId(2), kind: "note", body: "Older", occurredAt: "2026-10-06T05:00:00.000Z" }),
      ]),
    });
    renderScreen(<Timeline lead={aLead()} />);
    await rows();
    const days = within(card()).getAllByRole("heading", { level: 3 });
    expect(days.map((day) => day.textContent)).toEqual([words.today, words.yesterday, "6 Oct"]);
    // Each day's list is named by its heading, with no landmark per day.
    expect(card().querySelector("section")).toBeNull();
    expect(within(card()).getByRole("list", { name: words.yesterday })).toHaveTextContent("Late last night");
    expect(within(card()).getByRole("list", { name: words.yesterday })).toHaveTextContent("11:45 pm");
  });

  it("shows the AI's entries alone, or the calls and chats alone, and All again", async () => {
    stubApi({
      "leads.timeline": aTimeline(
        [
          anEntry({ kind: "note", body: "Mine", byAi: false }),
          anEntry({ kind: "note", body: "The AI's", byAi: true, actorUserId: null }),
          anEntry({ kind: "ai-field-set", actorUserId: null, field: "adults", from: null, to: "4" }),
          anEntry({ kind: "call", callId: ids.task, outcome: "busy", note: null }),
          anEntry({ kind: "whatsapp-contact" }),
          anEntry({
            kind: "repeat-enquiry",
            enquiry: { source: "instagram", sourceDetail: null, note: null, trip: aLead().trip },
          }),
          anEntry({ kind: "created", source: "phone_call", assignment: null }),
        ].map((entry, index) => ({ ...entry, id: entryId(index) })),
      ),
    });
    renderScreen(<Timeline lead={aLead()} />);
    expect(await sentences()).toHaveLength(7);
    const filters = within(card()).getByLabelText(words.filters.label);
    await userEvent.click(within(filters).getByRole("radio", { name: words.filters.ai }));
    expect(await sentences()).toEqual([words.aiNote, "AI Adults set to 4"]);
    await userEvent.click(within(filters).getByRole("radio", { name: words.filters.callsAndChats }));
    expect(await sentences()).toEqual([
      words.call.replace("{outcome}", "Busy or call later"),
      words.whatsappContact,
      words.repeatEnquiry,
    ]);
    await userEvent.click(within(filters).getByRole("radio", { name: words.filters.all }));
    expect(await sentences()).toHaveLength(7);
  });

  it("says so when a filter finds nothing, of the entries shown while older ones are still to load", async () => {
    stubApi({ "leads.timeline": aTimeline(entries()) });
    const { unmount } = renderScreen(<Timeline lead={aLead()} />);
    await rows();
    await userEvent.click(within(card()).getByRole("radio", { name: words.filters.ai }));
    expect(await screen.findByText(words.noneShown)).toBeVisible();
    unmount();

    stubApi({ "leads.timeline": aTimeline(entries(), entryId(8)) });
    renderScreen(<Timeline lead={aLead()} />);
    await rows();
    await userEvent.click(within(card()).getByRole("radio", { name: words.filters.ai }));
    expect(await screen.findByText(words.noneLoaded)).toBeVisible();
    expect(screen.getByRole("button", { name: words.showMore })).toBeVisible();
  });

  it("in the inbox's contact panel has no filters, which its width can't hold", async () => {
    stubApi({ "leads.timeline": aTimeline(entries()) });
    renderScreen(<Timeline lead={aLead()} place="panel" />);
    expect(await sentences()).toHaveLength(9);
    expect(within(card()).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("keeps an unsent note for the tab on the lead's page, so a new layout's box finds it, and forgets it once sent", async () => {
    window.sessionStorage.clear();
    stubApi({ "leads.timeline": aTimeline(entries()), "leads.addNote": { data: null } });
    const { unmount } = renderScreen(<Timeline lead={aLead()} />);
    await userEvent.type(await openNoteBox(), "Half a thought");
    unmount();
    const again = renderScreen(<Timeline lead={aLead()} boxed />, { width: "wide" });
    const box = await screen.findByLabelText(words.addNote);
    expect(box).toHaveValue("Half a thought");
    // Kept, it shows open, with its button.
    await userEvent.click(screen.getByRole("button", { name: words.saveNote }));
    await waitFor(() => {
      expect(box).toHaveValue("");
    });
    again.unmount();
    renderScreen(<Timeline lead={aLead()} />);
    expect(await screen.findByLabelText(words.addNote)).toHaveValue("");

    // The inbox's panel keeps nothing.
    window.sessionStorage.clear();
    renderScreen(<Timeline lead={aLead()} place="panel" />);
    await userEvent.type((await screen.findAllByLabelText(words.addNote)).at(-1) ?? card(), "Panel words");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("cuts a long note to three lines, with More to read the rest", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(66);
    stubApi({ "leads.timeline": aTimeline([anEntry({ kind: "note", body: "A long note", byAi: false })]) });
    renderScreen(<Timeline lead={aLead()} />);
    const words = await screen.findByText("A long note");
    expect(words).toHaveClass("line-clamp-3");
    await userEvent.click(screen.getByRole("button", { name: messages.common.readMore }));
    expect(words).not.toHaveClass("line-clamp-3");
    vi.restoreAllMocks();
  });

  it("in one column shows the newest five, then Show more, then Show older", async () => {
    stubApi({ "leads.timeline": aTimeline(entries(), entryId(8)) });
    renderScreen(<Timeline lead={aLead()} firstShown={5} />);
    expect(await sentences()).toHaveLength(5);
    expect(screen.queryByRole("button", { name: words.showMore })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: words.showFirst }));
    expect(await sentences()).toHaveLength(9);
    expect(screen.getByRole("button", { name: words.showMore })).toBeVisible();
  });

  it("on a computer fills its column, its entries scrolling in a box the keyboard can reach", async () => {
    stubApi({ "leads.timeline": aTimeline(entries()) });
    renderScreen(<Timeline lead={aLead()} boxed />, { width: "wide" });
    await rows();
    expect(card()).toHaveClass("flex-1", "min-h-80");
    const box = within(card()).getByRole("region", { name: words.entries });
    expect(box).toHaveClass("overflow-y-auto", "min-h-0", "flex-1");
    expect(box).toHaveAttribute("tabindex", "0");
    expect(within(box).getAllByRole("listitem")).toHaveLength(9);
    // The filters and the note box stay above the box, not in it.
    expect(box).not.toContainElement(screen.getByLabelText(words.addNote));
  });

  it("keeps the note box to one line until it is used, then shows Add note", async () => {
    stubApi({ "leads.timeline": aTimeline(entries()) });
    renderScreen(<Timeline lead={aLead()} />);
    const box = await screen.findByLabelText(words.addNote);
    expect(box).toHaveAttribute("rows", "1");
    expect(screen.queryByRole("button", { name: words.saveNote })).not.toBeInTheDocument();
    await userEvent.click(box);
    expect(box).toHaveAttribute("rows", "3");
    expect(screen.getByRole("button", { name: words.saveNote })).toBeVisible();
    // Left empty, it closes again.
    await userEvent.click(card());
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: words.saveNote })).not.toBeInTheDocument();
    });
  });

  it("asks for the note's words before sending, and offers no note to someone who can't edit leads", async () => {
    stubApi({ "leads.timeline": aTimeline(entries()) });
    const { unmount } = renderScreen(<Timeline lead={aLead()} />);
    await openNoteBox();
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

  it("holds the note box while the note is being sent, then gives it the focus back", async () => {
    const sending = heldAnswer({ data: null });
    stubApi({ "leads.timeline": aTimeline(entries()), "leads.addNote": sending.answer });
    renderScreen(<Timeline lead={aLead()} />);
    const box = await openNoteBox();
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
    // Ready for the next note: the focus is back in the box, not on the page.
    await waitFor(() => {
      expect(box).toHaveFocus();
    });
  });

  describe("why an automatic assignment chose the owner (release 4)", () => {
    const created = (assignment: object) =>
      anEntry({
        kind: "created",
        source: "web_form",
        actorUserId: null,
        assignment: { ownerUserId: owner.user.id, reason: "turns", rulePosition: null, away: false, ...assignment },
      });

    async function lineFor(assignment: object): Promise<string> {
      stubApi({ "leads.timeline": aTimeline([created(assignment)]) });
      renderScreen(<Timeline lead={aLead()} />);
      const [row] = await rows();
      return within(row ?? card()).getByText(/Assigned to|Nobody could/).textContent;
    }

    it.each([
      [{ reason: "turns" }, "Assigned to Asha Sharma, whose turn it was."],
      [{ reason: "returning" }, "Assigned to Asha Sharma, who owned this customer's earlier lead."],
      [{ reason: "rule", rulePosition: 1 }, "Assigned to Asha Sharma by rule 2."],
      [{ reason: "fewest_open" }, "Assigned to Asha Sharma, who had the fewest open leads."],
      [{ reason: "owner" }, "Assigned to Asha Sharma, the Owner."],
      [{ reason: "none", ownerUserId: null }, "Nobody could take it, so it waits in Unassigned."],
    ])("says %j as one line", async (assignment, line) => {
      expect(await lineFor(assignment)).toBe(line);
    });

    it("says when the person was away, for a manager to reassign", async () => {
      await lineFor({ reason: "returning", away: true });
      expect(screen.getByText("Asha Sharma is away. Reassign it if someone else should have it.")).toBeVisible();
    });

    it("says nothing for a lead added by hand", async () => {
      stubApi({
        "leads.timeline": aTimeline([anEntry({ kind: "created", source: "phone_call", assignment: null } as never)]),
      });
      renderScreen(<Timeline lead={aLead()} />);
      await rows();
      expect(screen.queryByText(/Assigned to/)).not.toBeInTheDocument();
    });
  });
});
