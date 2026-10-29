// Calls on a lead (release 5, scope 3.4): a call written up from the call panel or on coming back from dialling (outcome,
// one line, the next follow-up), shown on the timeline with its outcome, changed or deleted by its writer in the first day
// and by a manager after; an unanswered call offers a follow-up two hours on.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { CallNoteDialog } from "@/leads/call/call-note-dialog";
import { CallReturn } from "@/leads/call/call-return";
import { rememberDial } from "@/leads/call/pending-call";
import { Timeline } from "@/leads/lead/timeline";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aLead, anEntry, aTimeline, ids } from "./records";
import { inputsTo, owner, renderScreen, salesperson } from "./screen";

const { call } = messages.leads;
const NOW = new Date("2026-10-16T05:30:00Z");
const callId = "0199e7a0-0000-7000-8000-0000000002aa";

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const aCall = (overrides: Record<string, unknown> = {}) =>
  anEntry({
    kind: "call",
    callId,
    outcome: "busy",
    note: "Call after the meeting",
    ...overrides,
  });

function Dialog({ existing }: { existing?: { callId: string; outcome: "busy"; note: string | null } }) {
  return (
    <CallNoteDialog
      leadId={ids.rahul}
      name="Rahul Sharma"
      held={{ open: true, setOpen: () => undefined }}
      {...(existing && { existing })}
    />
  );
}

describe("a call on the timeline", () => {
  it("shows its outcome and note, and offers Edit and Delete to its writer within a day", async () => {
    stubApi({ "leads.timeline": aTimeline([aCall()]) });
    renderScreen(<Timeline lead={aLead()} />, { me: salesperson });
    const item = await screen.findByRole("listitem");
    expect(within(item).getByRole("heading")).toHaveTextContent("Call: Busy or call later");
    expect(item).toHaveTextContent("Call after the meeting");
    expect(within(item).getByRole("button", { name: /Edit the call/ })).toBeEnabled();
    expect(within(item).getByRole("button", { name: /Delete the call/ })).toBeEnabled();
  });

  it("offers neither to someone else's, or to the writer after a day; a manager always has them", async () => {
    const old = aCall({ occurredAt: "2026-10-14T05:30:00.000Z" });
    stubApi({ "leads.timeline": aTimeline([old]) });
    const { unmount } = renderScreen(<Timeline lead={aLead()} />, { me: salesperson });
    await screen.findByText("Call after the meeting");
    expect(screen.queryByRole("button", { name: /Edit the call/ })).toBeNull();
    unmount();

    renderScreen(<Timeline lead={aLead()} />, { me: member({ permissions: ["leads:view", "leads:edit"] }) });
    await screen.findByText("Call after the meeting");
    expect(screen.queryByRole("button", { name: /Delete the call/ })).toBeNull();
  });

  it("lets a manager delete a call after confirming", async () => {
    stubApi({
      "leads.timeline": aTimeline([aCall({ occurredAt: "2026-10-14T05:30:00.000Z" })]),
      "calls.remove": { data: null },
    });
    renderScreen(<Timeline lead={aLead()} />, { me: owner });
    await userEvent.click(await screen.findByRole("button", { name: /Delete the call/ }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(call.delete.title);
    await userEvent.click(within(confirm).getByRole("button", { name: call.delete.label }));
    await waitFor(() => {
      expect(inputsTo("calls.remove")).toEqual([{ callId }]);
    });
  });
});

describe("How did the call go?", () => {
  it("writes the call up with its outcome and note", async () => {
    stubApi({ "calls.log": { data: { callId } } });
    renderScreen(<Dialog />);
    expect(await screen.findByText(call.note.title)).toBeVisible();
    await userEvent.click(screen.getByRole("radio", { name: call.note.outcomes.spoke }));
    await userEvent.type(screen.getByLabelText(call.note.note), "Wants a houseboat night");
    await userEvent.click(screen.getByRole("button", { name: call.note.submit }));
    await waitFor(() => {
      expect(inputsTo("calls.log")).toEqual([{ leadId: ids.rahul, outcome: "spoke", note: "Wants a houseboat night" }]);
    });
  });

  it("offers a follow-up two hours on after a call nobody answered, which the person can clear", async () => {
    stubApi({ "calls.log": { data: { callId } } });
    renderScreen(<Dialog />);
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(call.note.followUp) });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: call.note.outcomes.no_answer }));
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });
    await userEvent.click(screen.getByRole("button", { name: call.note.submit }));
    await waitFor(() => {
      expect(inputsTo("calls.log")).toHaveLength(1);
    });
    const [sent] = inputsTo("calls.log") as { outcome: string; followUp?: { due: { on: string; at: string } } }[];
    expect(sent?.outcome).toBe("no_answer");
    // 07:30 UTC is 13:00 in India: about two hours on, on the agency's clock.
    expect(sent?.followUp?.due).toEqual({ on: "2026-10-16", at: "13:00" });
  });

  it("sends no follow-up once the person clears it", async () => {
    stubApi({ "calls.log": { data: { callId } } });
    renderScreen(<Dialog />);
    await userEvent.click(screen.getByRole("radio", { name: call.note.outcomes.no_answer }));
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(call.note.followUp) });
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: call.note.submit }));
    await waitFor(() => {
      expect(inputsTo("calls.log")).toEqual([{ leadId: ids.rahul, outcome: "no_answer" }]);
    });
  });

  it("changes a call already written, with no follow-up to offer", async () => {
    stubApi({ "calls.edit": { data: null } });
    renderScreen(<Dialog existing={{ callId, outcome: "busy", note: "First" }} />);
    expect(await screen.findByText(call.note.titleEdit)).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: call.note.outcomes.spoke }));
    await userEvent.click(screen.getByRole("button", { name: call.note.submit }));
    await waitFor(() => {
      expect(inputsTo("calls.edit")).toEqual([{ callId, outcome: "spoke", note: "First" }]);
    });
  });

  it("opens by itself on coming back to the app after dialling, once", async () => {
    stubApi({});
    rememberDial({ leadId: ids.rahul, name: "Rahul Sharma" });
    renderScreen(<CallReturn />);
    expect(await screen.findByText(call.note.title)).toBeVisible();
    expect(screen.getByText(/Your call with Rahul Sharma/)).toBeVisible();
  });

  it("stays shut when no call was started", () => {
    stubApi({});
    renderScreen(<CallReturn />);
    expect(screen.queryByText(call.note.title)).toBeNull();
  });
});
