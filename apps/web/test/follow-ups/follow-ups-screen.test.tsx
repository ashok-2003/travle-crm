// Follow-ups (web revamp, spec 7; part 2): tabs Due and Later with their counts, beside Mine / Everyone; each tab one
// table in due order, the due time in its urgency's colour, the owner only for everyone's; the header counts what is
// due and how many replied; each row says one next move; Done asks when the next follow-up is.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FollowUpsScreen } from "@/follow-ups/follow-ups-screen";
import { messages } from "@/i18n/messages";
import { renderAs, screenIs } from "../organization/render";
import { stubCalls, type Call, type Reply } from "../today/api";
import { now } from "../today/records";

const words = messages.tasks.followUps;

const chat = (lastFrom: "customer" | "team", windowOpen: boolean) => ({
  conversationId: "0199e7a0-0000-7000-8000-000000000501",
  lastAt: "2026-10-16T03:30:00.000Z",
  lastFrom,
  lastText: "Is the Goa trip still on?",
  windowOpen,
});

function aRow(id: string, name: string, dueAt: string, parts: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    taskId: `0199e7a0-0000-7000-8000-0000000002${id}`,
    title: `Send options to ${name}`,
    dueAt,
    assigneeUserId: null,
    byAi: false,
    lead: { id: `0199e7a0-0000-7000-8000-0000000003${id}`, name, stage: "contacted", phone: "+919812345678" },
    whatsapp: null,
    ai: null,
    ...parts,
  };
}

// 16 Oct 2026, 10:00 in India: Asha is overdue, Bina and Chitra are due today.
const asha = aRow("01", "Asha", "2026-10-15T11:30:00.000Z");
const bina = aRow("02", "Bina", "2026-10-16T10:30:00.000Z");
const chitra = aRow("03", "Chitra", "2026-10-16T08:30:00.000Z", { whatsapp: chat("customer", true) });
const divya = aRow("04", "Divya", "2026-10-17T05:00:00.000Z");
const esha = aRow("05", "Esha", "2026-10-20T05:00:00.000Z");
const farah = aRow("06", "Farah", "2026-11-05T05:00:00.000Z");

let board: Record<"due" | "upcoming", FollowUpRow[]>;
let calls: Call[];

function answer(call: Call): Reply {
  if (call.path === "tasks.followUps") {
    const { view } = call.input as { view: "due" | "upcoming" };
    return { data: { rows: board[view], people: {} } };
  }
  if (call.path === "leads.addWork" || call.path === "tasks.complete") return { data: null };
  return { status: 404, reason: "NOT_FOUND" };
}

function renderScreen() {
  const api = stubCalls(answer);
  calls = api.calls;
  return renderAs(<FollowUpsScreen />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("wide");
  board = { due: [asha, bina, chitra], upcoming: [divya, esha, farah] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const panel = (name: string) => screen.findByRole("tabpanel", { name });
const names = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("link")[0]?.textContent);

describe("FollowUpsScreen", () => {
  it("has the tabs Due and Later with their counts, and no All", async () => {
    renderScreen();
    expect(await screen.findByRole("tab", { name: "Due 3" })).toBeVisible();
    expect(await screen.findByRole("tab", { name: "Later 3" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: /^All/ })).toBeNull();
  });

  it("reads '3 due · 1 replied' under the title, what is due in red, whichever tab is open", async () => {
    renderScreen();
    const intro = (_: string, el: Element | null) => el?.tagName === "P" && el.textContent === "3 due · 1 replied";
    expect(await screen.findByText(intro)).toBeVisible();
    expect(screen.getByText("3 due")).toHaveClass("bg-status-bad-fill", "text-status-bad-ink");
    await userEvent.click(await screen.findByRole("tab", { name: "Later 3" }));
    expect(screen.getByText(intro)).toBeVisible();
  });

  it("holds Due as one table in due order, with no groups, the due time red when overdue", async () => {
    renderScreen();
    const due = await panel("Due 3");
    const table = within(due).getByRole("table", { name: "Due" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      words.columns.customer,
      words.columns.due,
      words.columns.remarks,
      words.columns.nextStep,
      words.columns.actions,
    ]);
    expect(names(table)).toEqual(["Asha", "Chitra", "Bina"]);
    expect(screen.queryByRole("region")).toBeNull();
    expect(within(table).getByText("15 Oct, 5:00 pm")).toHaveClass("text-status-bad-ink");
    expect(within(table).getByText("16 Oct, 4:00 pm")).toHaveClass("text-people-tint-ink");
  });

  it("puts the stage under the customer's name and the remarks in their own column", async () => {
    renderScreen();
    const row = (await within(await panel("Due 3")).findByRole("link", { name: "Bina" })).closest("tr");
    if (row === null) throw new Error("Bina has no row");
    const [customer, , remarks] = within(row).getAllByRole("cell");
    expect(customer).toContainElement(within(row).getByText(messages.leads.stages.contacted));
    const title = within(row).getByText("Send options to Bina");
    expect(remarks).toContainElement(title);
    expect(title).toHaveClass("line-clamp-3");
  });

  it("holds Later as one table in due order", async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole("tab", { name: "Later 3" }));
    expect(names(within(await panel("Later 3")).getByRole("table", { name: "Later" }))).toEqual([
      "Divya",
      "Esha",
      "Farah",
    ]);
  });

  it("says one next move per row, and none of the old window and AI lines", async () => {
    board.due = [
      aRow("11", "Open", "2026-10-16T10:30:00.000Z", { whatsapp: chat("customer", true) }),
      aRow("12", "Shut", "2026-10-16T10:30:00.000Z", { whatsapp: chat("customer", false) }),
      aRow("13", "Sent", "2026-10-16T10:30:00.000Z", { ai: { at: now.toISOString(), outcome: "sent", text: "Hi" } }),
      aRow("14", "Failed", "2026-10-16T10:30:00.000Z", {
        ai: { at: now.toISOString(), outcome: "failed", text: null },
      }),
      aRow("15", "Nothing", "2026-10-16T10:30:00.000Z", { byAi: true }),
    ];
    renderScreen();
    await panel("Due 5");
    expect(screen.getAllByText(words.nextMove["answer-whatsapp"])).toHaveLength(1);
    expect(screen.getAllByText(words.nextMove["replied-window-closed"])).toHaveLength(1);
    expect(screen.getAllByText(words.nextMove.call)).toHaveLength(1);
    expect(screen.getAllByText(words.nextMove["call-or-template"])).toHaveLength(1);
    expect(screen.queryByText(/Window open|Window closed|AI wrote|Added by AI/)).toBeNull();
  });

  it("asks 'When's the next follow-up?' on Done, and Tomorrow adds it for the same person, words and time", async () => {
    renderScreen();
    const due = await panel("Due 3");
    await userEvent.click(within(due).getByRole("button", { name: "Done: Send options to Bina" }));
    const dialog = await screen.findByRole("dialog", { name: "When's the next follow-up?" });
    for (const label of ["Tomorrow", "In 3 days", "Next week", "No more follow-ups"]) {
      expect(within(dialog).getByRole("button", { name: label })).toBeVisible();
    }
    await userEvent.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    await waitFor(() => {
      expect(calls.find((call) => call.path === "leads.addWork")?.input).toEqual({
        leadId: bina.lead.id,
        kind: "follow-up",
        title: "Send options to Bina",
        due: { on: "2026-10-17", at: "16:00" },
      });
    });
  });

  it("closes with no new follow-up on 'No more follow-ups'", async () => {
    renderScreen();
    const due = await panel("Due 3");
    await userEvent.click(within(due).getByRole("button", { name: "Done: Send options to Bina" }));
    const dialog = await screen.findByRole("dialog", { name: "When's the next follow-up?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "No more follow-ups" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(calls.some((call) => call.path === "leads.addWork")).toBe(false);
  });

  it("has no Open chat link: the WhatsApp button opens the chat", async () => {
    board.due = [chitra];
    renderScreen();
    const due = await panel("Due 1");
    expect(within(due).queryByRole("link", { name: /Open chat/ })).toBeNull();
    expect(within(due).getByRole("link", { name: /WhatsApp/ })).toBeVisible();
    expect(within(due).getByRole("button", { name: "Done: Send options to Chitra" })).toBeVisible();
  });

  it("shows the last message muted as the next step, at most three lines, with the whole of it in its title", async () => {
    board.due = [aRow("21", "Team", "2026-10-16T08:30:00.000Z", { whatsapp: chat("team", true) })];
    renderScreen();
    const due = await panel("Due 1");
    expect(within(due).getByText("Send options to Team")).toBeVisible();
    const message = within(due).getByText(/Last message from your team/);
    expect(message).toHaveClass("line-clamp-3");
    expect(message).toHaveAttribute("title", message.textContent);
  });

  it("draws Call, WhatsApp, Done, Snooze and Edit as named icons, Done in blue", async () => {
    renderScreen();
    const row = (await within(await panel("Due 3")).findByRole("link", { name: "Bina" })).closest("tr");
    if (row === null) throw new Error("Bina has no row");
    const buttons = [
      within(row).getByRole("button", { name: "Call Bina" }),
      within(row).getByRole("link", { name: "WhatsApp Bina" }),
      within(row).getByRole("button", { name: "Done: Send options to Bina" }),
      within(row).getByRole("button", { name: "Snooze: Send options to Bina" }),
      within(row).getByRole("button", { name: "Edit: Send options to Bina" }),
    ];
    for (const button of buttons) {
      expect(button).toHaveAttribute("data-size", "icon-sm");
      expect(button).toHaveTextContent(/^$/);
    }
    expect(buttons.map((button) => button.dataset.variant)).toEqual(["quiet", "quiet", "ghost", "quiet", "quiet"]);
  });

  it("draws its tabs as solid lists, the chosen one dark", async () => {
    renderScreen();
    const due = await screen.findByRole("tab", { name: "Due 3" });
    expect(due.closest("[data-slot=tabs-list]")).toHaveAttribute("data-variant", "solid");
  });

  it("keeps Mine and Everyone for members who see every lead, the owner shown for everyone's", async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole("tab", { name: messages.leads.list.everyone }));
    const table = within(await panel("Due 3")).getByRole("table", { name: "Due" });
    await waitFor(() => {
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toContain(words.columns.owner);
    });
    expect(within(table).getAllByText(words.unassigned)).toHaveLength(3);
  });

  it("shows five rows on a phone, then Show more for the rest", async () => {
    screenIs("phone");
    const seven = ["Gita", "Hari", "Indu", "Jaya", "Kiran", "Lata", "Mani"];
    board = {
      due: seven.map((name, index) => aRow(`1${String(index)}`, name, "2026-10-15T11:30:00.000Z")),
      upcoming: [],
    };
    renderScreen();
    const due = await panel("Due 7");
    expect(within(due).getAllByRole("listitem")).toHaveLength(5);
    await userEvent.click(within(due).getByRole("button", { name: words.showMore }));
    expect(within(due).getAllByRole("listitem")).toHaveLength(7);
    expect(within(due).queryByRole("button", { name: words.showMore })).toBeNull();
  });

  it("shows every row on a wide screen", async () => {
    board = {
      due: ["Gita", "Hari", "Indu", "Jaya", "Kiran", "Lata"].map((name, index) =>
        aRow(`1${String(index)}`, name, "2026-10-15T11:30:00.000Z"),
      ),
      upcoming: [],
    };
    renderScreen();
    expect(within(await panel("Due 6")).getAllByRole("row")).toHaveLength(7);
  });
});
