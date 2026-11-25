// One AI turn's row, a super admin's alone, and every opening fetched once.
import type { AiTraceDetail } from "@travel-crm/contracts/platform";
import { focusManager } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTraceScreen } from "@/console/ai/ai-trace-screen";
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
  it("shows the turn's row", async () => {
    open(detail());
    expect(await screen.findByText("replied")).toBeVisible();
    expect(screen.getByText("1,200 in · 80 out")).toBeVisible();
    expect(screen.getByText(formatDayTime(new Date(at), { timeZone: PLATFORM_TIME_ZONE }))).toBeVisible();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText(words.logged)).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toBeVisible();
    expect(screen.getByRole("link", { name: words.thisChat })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces?chat=${chatId}`,
    );
  });

  it.each([404, 400])("says a trace no longer kept with the way back (%i)", async (status) => {
    open({ status });
    expect(await screen.findByText(words.notFound)).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces`,
    );
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

  it.each([
    ["answered", detail()],
    ["refused", { status: 403 }],
  ])("opens once even when React mounts it twice (%s)", async (_name, answer) => {
    stubApi({ "platform.aiTransparency.trace": answer });
    renderConsole(
      <StrictMode>
        <AiTraceScreen organizationId={organizationId} traceId={traceId} />
      </StrictMode>,
    );
    await screen.findByRole("heading", { name: words.title });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(inputsTo("aiTransparency.trace")).toHaveLength(1);
  });

  it("tells support the page is a super admin's, and asks nothing", async () => {
    open(detail(), platformStaff("support"));
    expect(await screen.findByText(messages.consoleAi.superAdminsOnly)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(inputsTo("aiTransparency.trace")).toEqual([]);
  });
});
