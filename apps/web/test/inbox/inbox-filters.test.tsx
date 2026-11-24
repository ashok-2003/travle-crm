// The inbox list's compact top: one sideways row of chips, each count once, and the stage, time and tag choices behind one
// Filters button whose label counts what was chosen; the choices kept in the tab still apply after a reload.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboxList } from "@/inbox/inbox-list";
import { messages } from "@/i18n/messages";
import { address } from "../leads/navigation";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

vi.mock("next/navigation", () => import("../leads/navigation"));

const t = messages.inbox;
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox"] as never });
const summary = (late: number) => ({
  waiting: 3,
  late,
  unread: 0,
  mine: 0,
  unassigned: 0,
  snoozed: 0,
  stages: { new: 0, contacted: 0, quote_sent: 0, booking_requested: 0, won: 0 },
});

function api(late = 0) {
  const asked: Record<string, unknown>[] = [];
  stubApi({
    "inbox.conversations": (input) => {
      asked.push(input as Record<string, unknown>);
      return { data: { items: [], nextCursor: null } };
    },
    "inbox.tags": { data: [] },
    "salesInbox.summary": { data: summary(late) },
  });
  return asked;
}

function show() {
  address.set("/inbox");
  return renderWithApi(<InboxList currentId={null} />, client(), member({ isOwner: true }));
}

beforeEach(() => {
  screenIs("wide");
  window.sessionStorage.clear();
  // Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

describe("the inbox list's compact top", () => {
  it("keeps the chips in one row that scrolls sideways", async () => {
    api();
    show();
    const group = await screen.findByRole("radiogroup", { name: t.filters });
    expect(group.parentElement).toHaveClass("overflow-x-auto");
    expect(group).not.toHaveClass("md:flex-wrap");
  });

  it("shows Waiting's count once, in the bad colour when any are late", async () => {
    api(2);
    show();
    const waiting = await screen.findByRole("radio", { name: new RegExp(t.filterWaiting) });
    await waitFor(() => {
      expect(waiting).toHaveTextContent("3");
    });
    expect(within(waiting).getAllByText("3")).toHaveLength(1);
    expect(waiting).toHaveAccessibleName(new RegExp(`${t.filterWaiting} 3.*2 chats waiting too long`));
    expect(within(waiting).getByText("3")).toHaveClass("text-status-bad-ink");
  });

  it("puts stage, time and tag behind a Filters button that counts the choices", async () => {
    const asked = api();
    show();
    expect(screen.queryByRole("combobox", { name: t.stageFilter })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: t.filtersButton }));
    await userEvent.click(await screen.findByRole("combobox", { name: t.stageFilter }));
    await userEvent.click(await screen.findByRole("option", { name: new RegExp(messages.leads.stages.won) }));
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ stage: "won" });
    });
    await userEvent.click(screen.getByRole("button", { name: t.filtersDone }));
    expect(await screen.findByRole("button", { name: t.filtersChosen.replace("{count}", "1") })).toBeInTheDocument();
  });

  it("applies a kept stage and time after a reload", async () => {
    window.sessionStorage.setItem("travel-crm.inbox.stage", "won");
    window.sessionStorage.setItem("travel-crm.inbox.period", "week");
    const asked = api();
    show();
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ stage: "won", period: "week" });
    });
    expect(await screen.findByRole("button", { name: t.filtersChosen.replace("{count}", "2") })).toBeInTheDocument();
  });
});
