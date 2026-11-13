// The AI agent page: each state, the handed-over chats and their links, the payments count only for who may see it, the tabs.
import { brand } from "@travel-crm/brand";
import { screen, waitFor } from "@testing-library/react";
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
  flagged: 2,
  bookingsRequested: 4,
};
const handed = [
  { conversationId, name: "Meera Rao", reason: "Asked for a discount", since: "2026-11-11T05:00:00.000Z" },
];
const suggestion = {
  id: "0199a000-0000-7000-8000-0000000000e1",
  leadId: "0199a000-0000-7000-8000-0000000000a1",
  name: "Rahul Verma",
  kind: "lost",
  lostReason: "other",
  reason: "Said they're not interested.",
  createdAt: "2026-11-11T06:00:00.000Z",
};
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
const owner = member({ isOwner: true });

function api(over: Record<string, unknown> = {}) {
  return stubApi(
    Object.fromEntries(
      Object.entries({
        "ai.agentSetup": setup,
        "ai.handedOver": [],
        "ai.stageSuggestions": { suggestions: [] },
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
const stateWords = [t.state.on, t.state.onNotReady, t.state.off, t.state.notSetUp, paused];
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
    ["On, but setup isn't finished, when it is on and no longer ready", { on: true }, t.state.onNotReady, false],
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

  it("shows a chat that has no name by its phone number, spaced the Indian way", async () => {
    api({ "ai.handedOver": [{ ...handed[0], name: "+919876543210" }] });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByRole("link", { name: "+91 98765 43210" })).toBeInTheDocument();
  });

  it("says nothing needs you when nothing does", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText(t.needsYou.nothing)).toBeInTheDocument();
  });

  it("lists the AI's Lost suggestions after the hand-overs, each with its lead, reason and buttons", async () => {
    const stub = api({
      "ai.handedOver": handed,
      "ai.stageSuggestions": { suggestions: [suggestion] },
      "ai.decideStageSuggestion": null,
    });
    renderWithApi(<AgentScreen />, client(), owner);
    const link = await screen.findByRole("link", { name: "Rahul Verma" });
    expect(link).toHaveAttribute("href", `/leads/${suggestion.leadId}`);
    expect(screen.getByText("Lost: Said they're not interested.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meera Rao" })).toBeInTheDocument();
    expect(screen.queryByText(t.needsYou.nothing)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, mark it Lost" }));
    await waitFor(() => {
      expect(stub.calls).toContain("ai.decideStageSuggestion");
    });
    const sent = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => (typeof init?.body === "string" ? init.body : ""))
      .find((body) => body.includes(suggestion.id));
    expect(JSON.parse(sent ?? "{}")).toEqual({ "0": { suggestionId: suggestion.id, accept: true } });
  });

  it("says nothing needs you only when hand-overs, payments and suggestions are all empty", async () => {
    api({ "ai.stageSuggestions": { suggestions: [suggestion] } });
    renderWithApi(<AgentScreen />, client(), owner);
    await screen.findByRole("link", { name: "Rahul Verma" });
    expect(screen.queryByText(t.needsYou.nothing)).not.toBeInTheDocument();
  });

  it("does not say nothing needs you while the suggestions are still loading", async () => {
    const stub = api();
    stub.answer("ai.stageSuggestions", "never");
    renderWithApi(<AgentScreen />, client(), owner);
    await waitFor(() => {
      expect(stub.calls).toContain("ai.stageSuggestions");
    });
    expect(screen.queryByText(t.needsYou.nothing)).not.toBeInTheDocument();
  });

  it("shows the load-failed alert, and not 'nothing needs you', when the suggestions fail", async () => {
    const stub = api();
    stub.answer("ai.stageSuggestions", { status: 500 });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText(t.needsYou.loadFailed)).toBeInTheDocument();
    expect(screen.queryByText(t.needsYou.nothing)).not.toBeInTheDocument();
  });

  it("puts a line between the strip's two rows on a phone", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    await screen.findByText(t.last24.bookings);
    expect(document.querySelector('[data-slot="separator"].md\\:hidden')).not.toBeNull();
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
    expect(stub.calls).not.toContain("ai.stageSuggestions");
  });

  it("shows the last 24 hours as a strip of four figures, each with an info hint and Indian grouping", async () => {
    api({ "ai.overview": { ...overview, chatsAnswered: 1234567, flagged: 2 } });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText("12,34,567")).toBeInTheDocument();
    expect(screen.getByText(t.last24.chats)).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText(t.last24.bookings)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(t.last24.flagged)).toBeInTheDocument();
    for (const label of [t.last24.chats, t.last24.messages, t.last24.bookings, t.last24.flagged]) {
      expect(screen.getByRole("button", { name: `What does ${label} mean?` })).toBeInTheDocument();
    }
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
