// One AI turn, whole, a super admin's alone: its row, then one part at a time (Understand, Lookups, Decision, Write,
// Checks and sent), the chat's messages as the chat keeps them now, long text wrapped, and every opening fetched once.
import type { AiTraceDetail, AiTraceFile } from "@travel-crm/contracts/platform";
import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTraceScreen } from "@/console/ai/ai-trace-screen";
import { readableJson } from "@/console/ai/trace-text";
import { messages } from "@/i18n/messages";
import { formatDayTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { stubApi, type Answer } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const words = messages.consoleAi.trace;
const organizationId = "0199a000-0000-7000-8000-000000000002";
const traceId = "0199a000-0000-7000-8000-0000000000a1";
const chatId = "0199a000-0000-7000-8000-00000000c4a7";
const at = "2026-11-12T08:30:00.000Z";

function file(overrides: Partial<AiTraceFile> = {}): AiTraceFile {
  return {
    intents: ["ask_price"],
    promptVersions: [{ name: "write.moves", used: 1, current: 1 }],
    understand: {
      blocks: [
        { title: "Agency", text: "Hills Travel" },
        { title: "Lead card", text: "Name: Riya" },
      ],
      answer: '{"intents":["ask_price"]}',
    },
    messages: [
      {
        id: "0199a000-0000-7000-8000-0000000000b1",
        from: "customer",
        at,
        kind: "text",
        text: "how much for kedarnath",
      },
    ],
    messagesGone: 0,
    lookups: [{ tool: "find_packages", request: '{\n  "tool": "find_packages"\n}', result: '{\n  "exact": []\n}' }],
    decision: {
      why: "Customer asked a price",
      note: "price_asked",
      task: null,
      suggest: { kind: "not_a_lead", reason: "Looks fake" },
    },
    checks: [
      { name: "no_price", passed: false, detail: "named a price" },
      { name: "language", passed: true, detail: null },
    ],
    write: { blocks: [{ title: "You", text: "Asha" }], answers: ['{"text":"first"}', '{"text":"second"}'] },
    sent: { text: "Hello! Which dates?", messages: [] },
    actions: ["stage:quote_sent"],
    ...overrides,
  };
}

function detail(overrides: Partial<AiTraceDetail> = {}): { data: AiTraceDetail } {
  return {
    data: {
      trace: {
        id: traceId,
        conversationId: chatId,
        startedAt: at,
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
      },
      priced: true,
      file: file(),
      ...overrides,
    },
  };
}

function open(answer: Answer, staff = platformStaff("super-admin")) {
  stubApi({ "platform.aiTransparency.trace": answer });
  renderConsole(<AiTraceScreen organizationId={organizationId} traceId={traceId} />, staff);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiTraceScreen", () => {
  it("shows the turn's row, the Understand blocks, the chat's messages and the form it returned", async () => {
    open(detail());
    expect(await screen.findByText("replied")).toBeVisible();
    expect(screen.getByText("1,200 in · 80 out")).toBeVisible();
    expect(screen.getByText("Agency")).toBeVisible();
    expect(screen.getByText("Lead card")).toBeVisible();
    const time = formatDayTime(new Date(at), { timeZone: PLATFORM_TIME_ZONE });
    expect(screen.getByText(`${words.from.customer} · ${time}`)).toBeVisible();
    expect(screen.getByText("how much for kedarnath")).toBeVisible();
    expect(screen.getByLabelText(words.answer).textContent).toBe(readableJson('{"intents":["ask_price"]}'));
    expect(screen.getByText(words.logged)).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toBeVisible();
    expect(screen.getByRole("link", { name: words.thisChat })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces?chat=${chatId}`,
    );
  });

  it("shows each tab's part", async () => {
    open(detail());
    await screen.findByText("replied");
    await userEvent.click(screen.getByRole("tab", { name: "Lookups (1)" }));
    expect(await screen.findByText("find_packages")).toBeVisible();
    expect(screen.getByText(words.asked)).toBeVisible();
    expect(screen.getByText(words.got)).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: words.tabs.decision }));
    expect(await screen.findByText("Customer asked a price")).toBeVisible();
    expect(screen.getByText("price_asked")).toBeVisible();
    expect(screen.getByText("not_a_lead: Looks fake")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: words.tabs.write }));
    expect(await screen.findByText("Try 1")).toBeVisible();
    expect(screen.getByText("Try 2")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: words.tabs.sent }));
    expect(await screen.findByText(words.failed)).toBeVisible();
    expect(screen.getByText(words.passed)).toBeVisible();
    expect(screen.getByText("Hello! Which dates?")).toBeVisible();
    expect(screen.getByText("stage:quote_sent")).toBeVisible();
  });

  it("says plainly that a missing file is missing, with the row and no tabs", async () => {
    open(detail({ file: null }));
    expect(await screen.findByText(words.fileMissing)).toBeVisible();
    expect(screen.getByText("replied")).toBeVisible();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("alert", { name: words.loadFailed })).toBeNull();
  });

  it.each([404, 400])("says a trace no longer kept with the way back (%i)", async (status) => {
    open({ status });
    expect(await screen.findByText(words.notFound)).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces`,
    );
  });

  it("names both versions of a prompt that changed since", async () => {
    open(detail({ file: file({ promptVersions: [{ name: "write.moves", used: 1, current: 2 }] }) }));
    expect(await screen.findByText("write.moves v1, now v2")).toBeVisible();
    expect(screen.getByRole("link", { name: words.promptsLink })).toHaveAttribute("href", "/console/ai-prompts");
  });

  it("keeps a very large trace readable: wrapped text, one part at a time", async () => {
    const huge = JSON.stringify({ text: "y".repeat(30_000) });
    open(detail({ file: file({ understand: { blocks: [], answer: huge }, write: { blocks: [], answers: [huge] } }) }));
    const answer = await screen.findByLabelText(words.answer);
    expect(answer.textContent).toBe(readableJson(huge));
    expect(answer.className).toContain("whitespace-pre-wrap");
    expect(answer.className).toContain("wrap-anywhere");
    expect(screen.queryByText("Try 1")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: words.tabs.write }));
    expect(await screen.findByText("Try 1")).toBeVisible();
    expect(screen.queryByLabelText(words.answer)).toBeNull();
  });

  it("is fetched once per visit, since each fetch is an opening in the platform log", async () => {
    open(detail());
    await screen.findByText("replied");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(inputsTo("aiTransparency.trace")).toEqual([{ organizationId, traceId }]);
  });

  it("is not asked again when it fails", async () => {
    open({ status: 500 });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(inputsTo("aiTransparency.trace")).toHaveLength(1);
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });

  it("tells support the page is a super admin's, and asks nothing", async () => {
    open(detail(), platformStaff("support"));
    expect(await screen.findByText(messages.consoleAi.superAdminsOnly)).toBeVisible();
    await waitFor(() => {
      expect(inputsTo("aiTransparency.trace")).toEqual([]);
    });
  });
});
