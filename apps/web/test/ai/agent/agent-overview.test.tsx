// The AI agent page: each state, the handed-over chats and their links, the payments count only for who may see it, the tabs.
import { brand } from "@travel-crm/brand";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentScreen } from "@/ai/agent/agent-screen";
import { messages } from "@/i18n/messages";
import { member } from "../../support/members";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { stubApi } from "../../support/api-stub";
import { address, routerCalls } from "../../leads/navigation";

vi.mock("next/navigation", () => import("../../leads/navigation"));

const t = messages.aiAgent;
const conversationId = "0199a000-0000-7000-8000-0000000000c1";
const setup = { steps: [], ready: false, on: false, pausedBySupport: false };
const overview = {
  chatsAnswered: 12,
  messagesSent: 30,
  medianReplySeconds: 5,
  flagged: 2,
  followUpsPlanned: 1,
  learnings: 0,
  model: null,
};
const handed = [
  { conversationId, name: "Meera Rao", reason: "Asked for a discount", since: "2026-11-11T05:00:00.000Z" },
];
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
const owner = member({ isOwner: true });

function api(over: Record<string, unknown> = {}) {
  return stubApi(
    Object.fromEntries(
      Object.entries({
        "ai.agentSetup": setup,
        "ai.handedOver": [],
        "ai.overview": overview,
        "paymentsToCheck.count": { count: 0 },
        ...over,
      }).map(([path, data]) => [path, { data }]),
    ),
  );
}

beforeEach(() => {
  screenIs("wide");
  address.set("/ai-agent");
});

const paused = t.state.paused.replace("{product}", brand.productName);
const stateWords = [t.state.on, t.state.off, t.state.notSetUp, paused];
/** Exactly one state is shown, and no link to Setup unless it is Not set up yet. */
function onlyState(shown: string, { setupLink }: { setupLink: boolean }) {
  expect(screen.getByText(shown)).toBeInTheDocument();
  for (const words of stateWords.filter((other) => other !== shown)) {
    expect(screen.queryByText(words)).not.toBeInTheDocument();
  }
  if (setupLink) {
    expect(screen.getByRole("link", { name: t.state.openSetup })).toHaveAttribute("href", "/ai-agent?tab=setup");
  } else {
    expect(screen.queryByRole("link", { name: t.state.openSetup })).not.toBeInTheDocument();
  }
}

describe("the AI agent page's state", () => {
  it.each([
    ["Not set up yet, with a link to Setup, while it is off and not ready", {}, t.state.notSetUp, true],
    ["Off when it is ready but off", { ready: true }, t.state.off, false],
    ["On while it answers", { ready: true, on: true }, t.state.on, false],
    ["Paused when it is on", { ready: true, on: true, pausedBySupport: true }, paused, false],
    ["Paused when it is off and ready", { ready: true, pausedBySupport: true }, paused, false],
    ["Paused when it is off and not ready, with no Setup link", { pausedBySupport: true }, paused, false],
  ])("says %s", async (_name, over, shown, setupLink) => {
    api({ "ai.agentSetup": { ...setup, ...over } });
    renderWithApi(<AgentScreen />, client(), owner);
    await screen.findByText(shown);
    onlyState(shown, { setupLink });
  });
});

describe("what needs you", () => {
  it("lists the handed-over chats, each opening the chat in the inbox", async () => {
    api({ "ai.handedOver": handed });
    renderWithApi(<AgentScreen />, client(), owner);
    const link = await screen.findByRole("link", { name: "Meera Rao" });
    expect(link).toHaveAttribute("href", `/inbox/${conversationId}`);
    expect(screen.getByText("Asked for a discount")).toBeInTheDocument();
    expect(screen.queryByText(t.needsYou.nothing)).not.toBeInTheDocument();
  });

  it("says nothing needs you when nothing does", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText(t.needsYou.nothing)).toBeInTheDocument();
  });

  it("shows the payments count, linking to Payments to check", async () => {
    api({ "paymentsToCheck.count": { count: 3 } });
    renderWithApi(<AgentScreen />, client(), owner);
    const link = await screen.findByRole("link", { name: /3 payments wait for you/ });
    expect(link).toHaveAttribute("href", "/payments");
  });

  it("hides payments and hand-overs from a member without their permissions, and never asks for them", async () => {
    const stub = api({ "paymentsToCheck.count": { count: 3 }, "ai.handedOver": handed });
    renderWithApi(<AgentScreen />, client(), member({ permissions: ["ai:manage"] }));
    expect(await screen.findByText(t.needsYou.nothing)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /payments wait/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Meera Rao")).not.toBeInTheDocument();
    expect(stub.calls).not.toContain("paymentsToCheck.count");
    expect(stub.calls).not.toContain("ai.handedOver");
  });

  it("shows the last 24 hours", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText(t.last24.chats)).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});

describe("the tabs", () => {
  it("keeps the open tab in the address", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    await userEvent.click(await screen.findByRole("tab", { name: t.tabs.setup }));
    expect(routerCalls.replace).toHaveBeenLastCalledWith("/ai-agent?tab=setup");
    expect(await screen.findByRole("switch", { name: t.setup.turnOn.title })).toBeInTheDocument();
  });

  it("opens the tab the address names", async () => {
    address.set("/ai-agent?tab=try");
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByRole("tab", { name: t.tabs.try, selected: true })).toBeInTheDocument();
  });
});
