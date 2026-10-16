// Adding a task from Today (spec 3.5, R50): a short line of what to do and a due day and time on the agency's clock,
// for oneself, or for anyone who can work leads with leads:assign, or on a lead found by search, which sends it to the
// lead as a task for the lead's owner (R21). The dialog holds while it saves (rule 7), and a time already past shows
// its refusal's sentence on the time.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { messages } from "@/i18n/messages";
import { AddTaskDialog } from "@/today/add-task-dialog";
import { inputsSentTo } from "../documents/sent";
import { renderAs, screenIs } from "../organization/render";
import { heldAnswer, stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { now } from "./records";

const words = messages.today.addTask;
const asha = member({ isOwner: true });
const ravi = "0199a000-0000-7000-8000-0000000000c2";
/** A salesperson: their own leads, no leads:assign. */
const sales = member({
  name: "Meera",
  userId: "0199a000-0000-7000-8000-0000000000c3",
  permissions: ["leads:view", "leads:create", "leads:edit"],
});

const rahulsLead = {
  id: "0199e7a0-0000-7000-8000-0000000000a3",
  person: { name: "Rahul Sharma", phone: "+919876543210" },
  returning: false,
  stage: "new",
  trip: { destinationName: "Kashmir", when: { kind: "month", month: "2026-12" }, adults: 2, childrenCount: 0 },
  source: "phone_call",
  ownerUserId: ravi,
  budget: null,
  createdAt: "2026-10-16T04:18:00.000Z",
  next: { awaitingReplySince: "2026-10-16T04:18:00.000Z", task: null },
};

const task = {
  id: "0199e7a0-0000-7000-8000-0000000000f9",
  kind: "task",
  title: "Renew the IATA licence",
  dueAt: "2026-10-16T11:00:00.000Z",
  firstDueAt: "2026-10-16T11:00:00.000Z",
  assigneeUserId: asha.user.id,
  record: null,
  doneAt: null,
  cancelledAt: null,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("wide");
  // Radix's Select and cmdk's list reach for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderDialog(me = asha) {
  return renderAs(
    <>
      <AddTaskDialog />
      <Toaster />
    </>,
    me,
  );
}

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: words.action }));
  return screen.findByRole("dialog", { name: words.title });
}

/** Says what to do and when: today (the day it opens on) at the time given. */
async function fillIn(dialog: HTMLElement, title: string, time: string) {
  await userEvent.type(within(dialog).getByRole("textbox", { name: words.what }), title);
  fireEvent.change(within(dialog).getByLabelText(messages.forms.due.time), { target: { value: time } });
}

describe("AddTaskDialog", () => {
  it("adds a standalone task for me with tasks.add { title, due, assigneeUserId: null }", async () => {
    stubApi({ "tasks.add": { data: task } });
    renderDialog(sales);
    const dialog = await openDialog();
    await fillIn(dialog, "Renew the IATA licence", "16:30");
    await userEvent.click(within(dialog).getByRole("button", { name: words.submit }));
    await waitFor(() => {
      expect(inputsSentTo("tasks.add")).toEqual([
        { title: "Renew the IATA licence", due: { on: "2026-10-16", at: "16:30" }, assigneeUserId: null },
      ]);
    });
    expect(await screen.findByText(words.added)).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("offers an assignee only with leads:assign", async () => {
    const api = stubApi({
      "leads.owners": {
        data: [
          { userId: asha.user.id, name: "Asha" },
          { userId: ravi, name: "Ravi" },
        ],
      },
      "tasks.add": { data: task },
    });
    const salesperson = renderDialog(sales);
    let dialog = await openDialog();
    expect(within(dialog).queryByRole("combobox", { name: words.assignee })).toBeNull();
    expect(api.calls).not.toContain("leads.owners");
    salesperson.unmount();

    renderDialog(asha);
    dialog = await openDialog();
    const assignee = within(dialog).getByRole("combobox", { name: words.assignee });
    expect(assignee).toHaveTextContent("Asha");
    await userEvent.click(assignee);
    await userEvent.click(await screen.findByRole("option", { name: "Ravi" }));
    await fillIn(dialog, "Collect the passport copies", "17:00");
    await userEvent.click(within(dialog).getByRole("button", { name: words.submit }));
    await waitFor(() => {
      expect(inputsSentTo("tasks.add")).toEqual([
        { title: "Collect the passport copies", due: { on: "2026-10-16", at: "17:00" }, assigneeUserId: ravi },
      ]);
    });
  });

  it("links a lead found by search and sends leads.addWork with kind 'task'", async () => {
    stubApi({
      "leads.owners": { data: [{ userId: asha.user.id, name: "Asha" }] },
      "leads.list": { data: { items: [rahulsLead], nextCursor: null, people: { [ravi]: "Ravi" } } },
      "leads.addWork": { data: { ...task, record: { recordType: "lead", recordId: rahulsLead.id } } },
    });
    renderDialog(asha);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole("combobox", { name: words.lead }));
    await userEvent.type(await screen.findByRole("combobox", { name: words.search }), "Rahul");
    await userEvent.click(await screen.findByRole("option", { name: /Rahul Sharma/ }));
    await waitFor(() => {
      expect(inputsSentTo("leads.list")).toContainEqual({ view: "everyone", search: "Rahul", limit: 10 });
    });
    expect(within(dialog).getByRole("combobox", { name: words.lead })).toHaveTextContent("Rahul Sharma");
    // The task goes to the lead's owner, so there is no one to choose.
    expect(within(dialog).queryByRole("combobox", { name: words.assignee })).toBeNull();
    await fillIn(dialog, "Send the Kashmir quote", "15:00");
    await userEvent.click(within(dialog).getByRole("button", { name: words.submit }));
    await waitFor(() => {
      expect(inputsSentTo("leads.addWork")).toEqual([
        {
          leadId: rahulsLead.id,
          kind: "task",
          title: "Send the Kashmir quote",
          due: { on: "2026-10-16", at: "15:00" },
        },
      ]);
    });
    expect(inputsSentTo("tasks.add")).toEqual([]);
  });

  it("says what the lead search is doing in a status outside the list, and a failed search with Try again", async () => {
    const api = stubApi({
      "leads.owners": { data: [{ userId: asha.user.id, name: "Asha" }] },
      "leads.list": { data: { items: [], nextCursor: null, people: {} } },
    });
    renderDialog(asha);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole("combobox", { name: words.lead }));
    const searchBox = await screen.findByRole("combobox", { name: words.search });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(words.searchHint);
    expect(screen.getByRole("listbox")).not.toContainElement(status);
    await userEvent.type(searchBox, "Zz");
    await waitFor(() => {
      expect(status).toHaveTextContent(words.noMatch);
    });

    api.answer("leads.list", { status: 500 });
    await userEvent.type(searchBox, "y");
    await waitFor(() => {
      expect(status).toHaveTextContent(messages.errors.generic);
    });
    api.answer("leads.list", { data: { items: [rahulsLead], nextCursor: null, people: {} } });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("option", { name: /Rahul Sharma/ })).toBeVisible();
    expect(status).toBeEmptyDOMElement();
  });

  it("holds while saving, and shows DUE_IN_THE_PAST's sentence on the time", async () => {
    const held = heldAnswer({ status: 400, reason: "DUE_IN_THE_PAST" });
    stubApi({ "tasks.add": held.answer });
    renderDialog(sales);
    const dialog = await openDialog();
    await fillIn(dialog, "Call the hotel", "10:00");
    await userEvent.click(within(dialog).getByRole("button", { name: words.submit }));
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: words.submitting })).toBeDisabled();
    });
    expect(within(dialog).getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: words.title })).toBeVisible();
    held.release();
    const time = within(dialog).getByLabelText(messages.forms.due.time);
    await waitFor(() => {
      expect(time).toHaveAttribute("aria-invalid", "true");
    });
    expect(time).toHaveAccessibleDescription(messages.errors.reasons.DUE_IN_THE_PAST);
    // Said once, on the time, not again at the end of the form.
    expect(within(dialog).getAllByText(messages.errors.reasons.DUE_IN_THE_PAST)).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: words.submit })).toBeEnabled();
  });
});
