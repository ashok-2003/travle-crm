// An organization's AI turns in the console, a super admin's alone: every turn of the last 14 days newest first (or one
// chat's), a table on a desktop and items on a phone, costs only when the console has prices, and a clear way on when
// a page's cursor has gone. Support is told it's a super admin's, and nothing is asked of the api.
import type { AiTracePage, AiTraceRow } from "@travel-crm/contracts/platform";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTracesScreen } from "@/console/ai/ai-traces-screen";
import { messages } from "@/i18n/messages";
import { formatDayTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { stubApi, type Answer } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const words = messages.consoleAi.traces;
const organizationId = "0199a000-0000-7000-8000-000000000002";
const chatId = "0199a000-0000-7000-8000-00000000c4a7";

function row(overrides: Partial<AiTraceRow> = {}): AiTraceRow {
  return {
    id: "0199a000-0000-7000-8000-0000000000a1",
    conversationId: chatId,
    startedAt: "2026-11-12T08:30:00.000Z",
    kind: "reply",
    outcome: "replied",
    reason: "quoted",
    move: "give_price",
    saleStage: "quoted",
    model: "fake-model",
    inputTokens: 1_200,
    outputTokens: 80,
    durationMs: 2_400,
    costPaise: 6,
    ...overrides,
  };
}

const page = (traces: AiTraceRow[], extra: Partial<AiTracePage> = {}): { data: AiTracePage } => ({
  data: { traces, nextCursor: null, priced: true, ...extra },
});

function open(
  answer: Answer,
  { wide = true, staff = platformStaff("super-admin"), chat = null as string | null } = {},
) {
  screenIs(wide ? "wide" : "phone");
  const api = stubApi({ "platform.aiTransparency.traces": answer });
  renderConsole(<AiTracesScreen organizationId={organizationId} conversationId={chat} />, staff);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiTracesScreen", () => {
  it("lists each turn with its outcome, move, tokens and cost", async () => {
    open(
      page([row(), row({ id: "0199a000-0000-7000-8000-0000000000a2", kind: "nudge", move: null, saleStage: null })]),
    );
    const time = formatDayTime(new Date("2026-11-12T08:30:00.000Z"), { timeZone: PLATFORM_TIME_ZONE });
    const link = await screen.findAllByRole("link", { name: time });
    expect(link[0]).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces/0199a000-0000-7000-8000-0000000000a1`,
    );
    const first = within(link[0]?.closest("tr") ?? document.body);
    expect(first.getByText("replied")).toBeVisible();
    expect(first.getByText("give_price")).toBeVisible();
    expect(first.getByText("1,200 in · 80 out")).toBeVisible();
    expect(first.getByText("₹0.06")).toBeVisible();
    expect(first.getByText("2.4 s")).toBeVisible();
    expect(first.getByRole("link", { name: `Chat ${chatId.slice(-6)}` })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces?chat=${chatId}`,
    );
    const second = within(link[1]?.closest("tr") ?? document.body);
    expect(second.getByText(words.kinds.nudge)).toBeVisible();
    expect(second.getAllByText(words.none).length).toBeGreaterThan(0);
    expect(inputsTo("aiTransparency.traces")).toEqual([{ organizationId, limit: 50 }]);
  });

  it("without prices it says so and shows tokens only", async () => {
    open(page([row({ costPaise: null })], { priced: false }));
    expect(await screen.findByText(words.noPricesTitle)).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: words.columns.cost })).toBeNull();
    expect(screen.getByText("1,200 in · 80 out")).toBeVisible();
  });

  it("lists one chat's turns, with a way back to all", async () => {
    open(page([row()]), { chat: chatId });
    expect(await screen.findByText(words.chatIntro)).toBeVisible();
    expect(screen.getByRole("link", { name: words.allChats })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces`,
    );
    expect(inputsTo("aiTransparency.traces")[0]).toEqual({ organizationId, conversationId: chatId, limit: 50 });
  });

  it("lists items on a phone", async () => {
    open(page([row()]), { wide: false });
    expect(await screen.findByText("1,200 in · 80 out", { exact: false })).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says when there are no turns", async () => {
    open(page([]));
    expect(await screen.findByText(words.empty)).toBeVisible();
  });

  it("shows the next page after the last turn of the one before", async () => {
    const api = open(page([row()], { nextCursor: "0199a000-0000-7000-8000-0000000000a1" }));
    await screen.findByText("replied");
    api.answer(
      "platform.aiTransparency.traces",
      page([row({ id: "0199a000-0000-7000-8000-0000000000a0", outcome: "held" })]),
    );
    await userEvent.click(screen.getByRole("button", { name: words.showMore }));
    expect(await screen.findByText("held")).toBeVisible();
    expect(inputsTo("aiTransparency.traces")).toEqual([
      { organizationId, limit: 50 },
      { organizationId, limit: 50, cursor: "0199a000-0000-7000-8000-0000000000a1" },
    ]);
  });

  it("says a swept cursor in words and starts the list again", async () => {
    const api = open(page([row()], { nextCursor: "0199a000-0000-7000-8000-0000000000a1" }));
    await screen.findByText("replied");
    api.answer("platform.aiTransparency.traces", { status: 404, reason: "AI_TRACE_CURSOR_GONE" });
    await userEvent.click(screen.getByRole("button", { name: words.showMore }));
    expect(await screen.findByText(messages.errors.reasons.AI_TRACE_CURSOR_GONE)).toBeVisible();
    api.answer("platform.aiTransparency.traces", page([row({ outcome: "fresh" })]));
    await userEvent.click(screen.getByRole("button", { name: words.startAgain }));
    expect(await screen.findByText("fresh")).toBeVisible();
    expect(inputsTo("aiTransparency.traces").at(-1)).toEqual({ organizationId, limit: 50 });
  });

  it("tells support the page is a super admin's, and asks nothing", async () => {
    open(page([row()]), { staff: platformStaff("support") });
    expect(await screen.findByText(messages.consoleAi.superAdminsOnly)).toBeVisible();
    expect(inputsTo("aiTransparency.traces")).toEqual([]);
  });
});
