// A lead's Follow-ups card (spec 3.4, R50; the lead page's revamp, 2026-11-21): every open follow-up and task on the lead,
// earliest first, each with what's next in words (red once overdue) and Done and Snooze; "None set." when there is none;
// the last contact in a line, the newest of the calls and the chat's messages; the automatic follow-ups with Stop (soft
// red) or Start. Add follow-up sends leads.addWork with a title and a due day and time on the agency's clock, and shows
// the api's refusal of a time already past.
import type { LeadWork } from "@travel-crm/contracts/crm";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { FollowUpsCard } from "@/leads/lead/follow-ups-card";
import { paidSubscription } from "../organization/api";
import { aMessage } from "../inbox/answer-api";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import { aLead, anEntry, aTimeline, ids } from "./records";
import { inputsTo, owner, renderScreen } from "./screen";

const { work: words, followUps } = messages.leads.lead;
const { follow } = messages.sales.lead;
const conversationId = "0199e7a0-0000-7000-8000-000000000f01";
// 11:00 am on Friday 16 October 2026 in India.
const NOW = new Date("2026-10-16T05:30:00Z");

const work = (changes: Partial<LeadWork>): LeadWork => ({
  id: ids.task,
  kind: "follow-up",
  title: "Send the Kashmir options",
  dueAt: "2026-10-16T10:30:00.000Z",
  assigneeUserId: owner.user.id,
  ...changes,
});

function renderCard(lead = aLead(), me = owner, answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "leads.addWork": {
      data: { ...work({}), firstDueAt: work({}).dueAt, record: null, doneAt: null, cancelledAt: null },
    },
    "leads.timeline": aTimeline([]),
    ...answers,
  });
  renderScreen(<FollowUpsCard lead={lead} />, { me, subscription: { ...paidSubscription, modules: ["inbox"] } });
  return api;
}

const aCall = (occurredAt: string) =>
  anEntry({ kind: "call", occurredAt, callId: ids.entry, outcome: "no_answer", note: null });
const chatOf = (...items: object[]): Record<string, Answer> => ({
  "inbox.leadChat": { data: { conversationId } },
  "inbox.messages": { data: { items, nextCursor: null, people: {}, unread: null } },
});
const sales = (cadence: object | null): Record<string, Answer> => ({
  "sales.forLead": { data: { heat: { score: 0, reasons: [] }, cadence } },
});
const active = { state: "active", sent: 1, steps: 3, nextAt: "2026-10-17T04:30:00.000Z", stopReason: null };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FollowUpsCard", () => {
  it("lists open work earliest first with Done and Snooze, and 'None set.' with Add follow-up", () => {
    renderCard(
      aLead({
        work: [
          work({}),
          work({ id: ids.otherTask, kind: "task", title: "Ask for passports", dueAt: "2026-10-17T05:30:00.000Z" }),
        ],
      }),
    );
    const card = screen.getByRole("region", { name: followUps.title });
    const items = within(within(card).getByRole("list", { name: words.title })).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("heading").textContent)).toEqual([
      "Send the Kashmir options",
      "Ask for passports",
    ]);
    expect(within(items[0] ?? card).getByText("Follow up today, 4:00 pm")).toBeVisible();
    expect(within(items[1] ?? card).getByText("Task due tomorrow, 11:00 am")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Done: Send the Kashmir options" })).toBeVisible();
    expect(within(card).getByRole("button", { name: "Snooze: Ask for passports" })).toBeVisible();
    cleanup();

    renderCard();
    const empty = screen.getByRole("region", { name: followUps.title });
    expect(within(empty).getByText(words.none)).toBeVisible();
    expect(within(empty).getByRole("button", { name: words.add })).toBeVisible();
  });

  it("sends addWork with { leadId, kind: 'follow-up', title, due: { on, at } }", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: words.add }));
    const dialog = await screen.findByRole("dialog", { name: words.dialog.title });
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.submit }));
    expect(await within(dialog).findByText(words.dialog.problems.required)).toBeVisible();

    await userEvent.type(within(dialog).getByLabelText(words.dialog.what), "Call about the houseboat");
    fireEvent.change(within(dialog).getByLabelText(messages.forms.due.time), { target: { value: "16:30" } });
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.submit }));
    await waitFor(() => {
      expect(inputsTo("leads.addWork")).toEqual([
        {
          leadId: ids.rahul,
          kind: "follow-up",
          title: "Call about the houseboat",
          due: { on: "2026-10-16", at: "16:30" },
        },
      ]);
    });
    expect(await screen.findByText(words.added)).toBeVisible();
  });

  it("says the api's refusal of a time already past on the time, where it is fixed", async () => {
    const api = renderCard();
    api.answer("leads.addWork", { status: 422, reason: "DUE_IN_THE_PAST" });
    await userEvent.click(screen.getByRole("button", { name: words.add }));
    const dialog = await screen.findByRole("dialog", { name: words.dialog.title });
    await userEvent.type(within(dialog).getByLabelText(words.dialog.what), "Call back");
    const time = within(dialog).getByLabelText(messages.forms.due.time);
    fireEvent.change(time, { target: { value: "09:00" } });
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.submit }));
    expect(await within(dialog).findByText(messages.errors.reasons.DUE_IN_THE_PAST)).toBeVisible();
    expect(time).toHaveAttribute("aria-invalid", "true");
    expect(time).toHaveAccessibleDescription(messages.errors.reasons.DUE_IN_THE_PAST);
    // Said once, on the time, not again at the end of the form.
    expect(within(dialog).getAllByText(messages.errors.reasons.DUE_IN_THE_PAST)).toHaveLength(1);
  });

  it("offers no Add follow-up to someone who can't edit leads", () => {
    renderCard(aLead(), member({ permissions: ["leads:view"] }));
    expect(screen.queryByRole("button", { name: words.add })).not.toBeInTheDocument();
  });

  it("says an overdue follow-up in red, with its dot", () => {
    renderCard(aLead({ work: [work({ dueAt: "2026-10-16T03:30:00.000Z" })] }));
    const due = screen.getByText("Follow-up overdue · today, 9:00 am");
    expect(due).toHaveClass("text-status-bad-ink");
    expect(due.querySelector("[aria-hidden=true]")).toHaveClass("bg-status-bad-dot");
  });

  it("says the last contact: the customer's newest message, when it is newer than the last call", async () => {
    renderCard(aLead(), owner, {
      "leads.timeline": aTimeline([aCall("2026-10-16T02:30:00.000Z")]),
      ...chatOf(aMessage({ body: "Ok thanks", occurredAt: "2026-10-16T03:30:00.000Z" })),
    });
    const card = screen.getByRole("region", { name: followUps.title });
    expect(await within(card).findByText("They wrote “Ok thanks” · 2 hr ago")).toBeVisible();
    expect(within(card).getByText(followUps.lastContact)).toBeVisible();
  });

  it("says the last call when it came after the chat, and what we or the AI wrote otherwise", async () => {
    renderCard(aLead(), owner, {
      "leads.timeline": aTimeline([aCall("2026-10-16T05:00:00.000Z")]),
      ...chatOf(
        aMessage({
          direction: "out",
          origin: "staff_crm",
          body: "Here you go",
          occurredAt: "2026-10-16T04:00:00.000Z",
        }),
      ),
    });
    expect(await screen.findByText("Call: No answer · 30 min ago")).toBeVisible();
    cleanup();

    renderCard(
      aLead(),
      owner,
      chatOf(
        aMessage({
          direction: "out",
          origin: "automation",
          byAi: true,
          kind: "image",
          body: null,
          occurredAt: "2026-10-14T05:30:00.000Z",
        }),
      ),
    );
    expect(await screen.findByText("The AI wrote “Photo” · 2 days ago")).toBeVisible();
    cleanup();

    renderCard(
      aLead(),
      owner,
      chatOf(
        aMessage({
          direction: "out",
          origin: "staff_crm",
          body: "Here you go",
          occurredAt: "2026-10-16T05:20:00.000Z",
        }),
      ),
    );
    expect(await screen.findByText("We wrote “Here you go” · 10 min ago")).toBeVisible();
  });

  it("says when there has been no call or message yet", async () => {
    renderCard();
    expect(await screen.findByText(followUps.none)).toBeVisible();
  });

  it("shows the automatic follow-ups with Stop in soft red while they run, and Start once stopped", async () => {
    renderCard(aLead(), owner, { ...sales(active), "sales.setFollowUps": { data: null } });
    expect(await screen.findByText("1 of 3 sent · the next goes 17 Oct, 10:00 am")).toBeVisible();
    const stop = screen.getByRole("button", { name: follow.stop });
    expect(stop).toHaveAttribute("data-variant", "destructive");
    await userEvent.click(stop);
    await waitFor(() => {
      expect(inputsTo("sales.setFollowUps")).toEqual([{ leadId: ids.rahul, on: false }]);
    });
    cleanup();

    renderCard(aLead(), owner, sales({ ...active, state: "stopped", stopReason: "replied" }));
    expect(await screen.findByText("Stopped after 1 · the customer wrote")).toBeVisible();
    expect(screen.getByRole("button", { name: follow.start })).toHaveAttribute("data-variant", "outline");
  });

  it("leaves out automatic follow-ups that never ran on a closed lead, and offers no Start there", async () => {
    renderCard(aLead({ stage: "lost" }), owner, sales(null));
    expect(await screen.findByText(followUps.none)).toBeVisible();
    expect(screen.queryByText(follow.label)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: follow.start })).not.toBeInTheDocument();
  });
});
