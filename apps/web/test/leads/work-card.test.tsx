// A lead's Next follow-up card (spec 3.4, R50): every open follow-up and task on the lead, earliest first, each with
// what's next in words and Done and Snooze; "None set." when there is none; Add follow-up sends leads.addWork with a
// title and a due day and time on the agency's clock, and shows the api's refusal of a time already past.
import type { LeadWork } from "@travel-crm/contracts/crm";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { WorkCard } from "@/leads/lead/work-card";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aLead, ids } from "./records";
import { inputsTo, owner, renderScreen } from "./screen";

const { work: words } = messages.leads.lead;
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

function renderCard(lead = aLead(), me = owner) {
  const api = stubApi({
    "leads.addWork": {
      data: { ...work({}), firstDueAt: work({}).dueAt, record: null, doneAt: null, cancelledAt: null },
    },
  });
  renderScreen(<WorkCard lead={lead} />, { me });
  return api;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WorkCard", () => {
  it("lists open work earliest first with Done and Snooze, and 'None set.' with Add follow-up", () => {
    renderCard(
      aLead({
        work: [
          work({}),
          work({ id: ids.otherTask, kind: "task", title: "Ask for passports", dueAt: "2026-10-17T05:30:00.000Z" }),
        ],
      }),
    );
    const card = screen.getByRole("region", { name: words.title });
    const items = within(card).getAllByRole("listitem");
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
    const empty = screen.getByRole("region", { name: words.title });
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
});
