// Follow-ups (web revamp, spec 7): tabs Due and Later; Due holds Overdue and Due today, Later groups Tomorrow, This week
// and Later; the header counts what is due and how many replied; replied customers come first; each row says one next
// move; Done asks when the next follow-up is.
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
  screenIs("phone");
  board = { due: [asha, bina, chitra], upcoming: [divya, esha, farah] };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const region = (name: string) => screen.findByRole("region", { name });

describe("FollowUpsScreen", () => {
  it("has the tabs Due and Later, and no All", async () => {
    renderScreen();
    expect(await screen.findByRole("tab", { name: "Due" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Later" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "All" })).toBeNull();
  });

  it("reads '3 due · 1 replied' under the title, whichever tab is open", async () => {
    renderScreen();
    expect(await screen.findByText("3 due · 1 replied")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Later" }));
    expect(screen.getByText("3 due · 1 replied")).toBeVisible();
  });

  it("holds Overdue and Due today under Due, replied customers first within a section", async () => {
    board.due = [
      asha,
      bina,
      chitra,
      aRow("07", "Gita", "2026-10-16T09:30:00.000Z", { whatsapp: chat("customer", true) }),
    ];
    renderScreen();
    const overdue = await region("Overdue");
    const today = await region("Due today");
    expect(within(overdue).getByRole("link", { name: "Asha" })).toBeVisible();
    // Gita and Chitra replied (Chitra is due sooner); Bina follows.
    const names = within(today)
      .getAllByRole("link", { name: /^(Bina|Chitra|Gita)$/ })
      .map((link) => link.textContent);
    expect(names).toEqual(["Chitra", "Gita", "Bina"]);
  });

  it("groups Later into Tomorrow, This week and Later", async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole("tab", { name: "Later" }));
    expect(within(await region("Tomorrow")).getByRole("link", { name: "Divya" })).toBeVisible();
    expect(within(await region("This week")).getByRole("link", { name: "Esha" })).toBeVisible();
    expect(within(await region("Later")).getByRole("link", { name: "Farah" })).toBeVisible();
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
    await region("Due today");
    expect(screen.getAllByText(words.nextMove["answer-whatsapp"])).toHaveLength(1);
    expect(screen.getAllByText(words.nextMove["replied-window-closed"])).toHaveLength(1);
    expect(screen.getAllByText(words.nextMove.call)).toHaveLength(1);
    expect(screen.getAllByText(words.nextMove["call-or-template"])).toHaveLength(1);
    expect(screen.queryByText(/Window open|Window closed|AI wrote|Added by AI/)).toBeNull();
  });

  it("asks 'When's the next follow-up?' on Done, and Tomorrow adds it for the same person, words and time", async () => {
    renderScreen();
    const today = await region("Due today");
    await userEvent.click(within(today).getByRole("button", { name: "Done: Send options to Bina" }));
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
    const today = await region("Due today");
    await userEvent.click(within(today).getByRole("button", { name: "Done: Send options to Bina" }));
    const dialog = await screen.findByRole("dialog", { name: "When's the next follow-up?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "No more follow-ups" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(calls.some((call) => call.path === "leads.addWork")).toBe(false);
  });

  it("keeps Mine and Everyone for members who see every lead", async () => {
    renderScreen();
    expect(await screen.findByRole("tab", { name: messages.leads.list.everyone })).toBeVisible();
  });
});
