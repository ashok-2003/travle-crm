// The AI agent's Overview: each state, the banner while setup holds it back, the last 24 hours on the AI's violet (only
// Chats answered a way into its list), and Needs you: its tiles' counts, amber when waiting, their buttons, and the lists.
import { brand } from "@travel-crm/brand";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentScreen } from "@/ai/agent/agent-screen";
import { messages } from "@/i18n/messages";
import { member } from "../../support/members";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { stubApi } from "../../support/api-stub";
import { address } from "../../leads/navigation";

vi.mock("next/navigation", () => import("../../leads/navigation"));

const t = messages.aiAgent;
const conversationId = "0199a000-0000-7000-8000-0000000000c1";
const setup = { steps: [], ready: false, on: false, pausedBySupport: false, numbers: [] };
const overview = {
  chatsAnswered: 12,
  messagesSent: 30,
  flagged: 2,
  bookingsRequested: 4,
};
const handed = [
  { conversationId, name: "Meera Rao", reason: "Asked for a discount", since: "2026-11-11T05:00:00.000Z" },
];
/** The api's answers: the newest rows, and how many wait in all. */
const chatsOf = (chats: unknown[], total = chats.length) => ({ chats, total });
const suggestionsOf = (suggestions: unknown[], total = suggestions.length) => ({ suggestions, total });
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
const step = (key: string, done = false) => ({ key, done, optional: key === "ads", count: null, total: null });

function api(over: Record<string, unknown> = {}) {
  return stubApi(
    Object.fromEntries(
      Object.entries({
        "ai.agentSetup": setup,
        "ai.handedOver": chatsOf([]),
        "ai.stageSuggestions": suggestionsOf([]),
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

describe("the AI agent page's state", () => {
  it.each([
    ["Not set up yet while it is off and not ready", {}, t.state.notSetUp],
    ["Off when it is ready but off", { ready: true }, t.state.off],
    ["On while it answers", { ready: true, on: true }, t.state.on],
    ["On, but not answering, when it is on and no longer ready", { on: true }, t.state.onNotReady],
    ["Paused when it is on", { ready: true, on: true, pausedBySupport: true }, paused],
    ["Paused when it is off and ready", { ready: true, pausedBySupport: true }, paused],
    ["Paused when it is off and not ready", { pausedBySupport: true }, paused],
  ])("says %s, and only that", async (_name, over, shown) => {
    api({ "ai.agentSetup": { ...setup, ...over } });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText(shown)).toBeInTheDocument();
    for (const words of stateWords.filter((other) => other !== shown)) {
      expect(screen.queryByText(words)).not.toBeInTheDocument();
    }
  });
});

describe("the banner while setup holds the agent back", () => {
  const notReady = { steps: [step("ai"), step("whatsapp", true), step("payment"), step("ads")] };
  const title = (count: number) => `The AI isn't answering yet: ${String(count)} steps left`;

  it.each([
    ["off", { ...notReady }],
    ["on", { ...notReady, on: true }],
  ])("says how many required steps are left while it is %s, names them once, and opens Setup", async (_name, over) => {
    api({ "ai.agentSetup": { ...setup, ...over } });
    renderWithApi(<AgentScreen />, client(), owner);
    const banner = await screen.findByRole("region", { name: title(2) });
    expect(
      within(banner)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([t.setup.steps.ai.todo, t.setup.steps.payment.todo]);
    expect(screen.getAllByText(t.setup.steps.payment.todo)).toHaveLength(1);
    expect(within(banner).getByRole("link", { name: t.banner.finish })).toHaveAttribute("href", "/ai-agent/setup");
    // Status amber, as Home's Needs your attention.
    expect(banner.className).toContain("status-attention");
  });

  it.each([
    ["it is ready", { ready: true }],
    ["support has paused it", { ...notReady, pausedBySupport: true }],
  ])("is not there when %s", async (_name, over) => {
    api({ "ai.agentSetup": { ...setup, ...over } });
    renderWithApi(<AgentScreen />, client(), owner);
    await screen.findByText(t.last24.chats);
    await screen.findByRole("link", { name: /^Setup/ });
    expect(screen.queryByRole("link", { name: t.banner.finish })).not.toBeInTheDocument();
  });
});

describe("the last 24 hours", () => {
  it("shows four figures on the AI's violet, each with an info hint and Indian grouping", async () => {
    api({ "ai.overview": { ...overview, chatsAnswered: 1234567 } });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText("12,34,567")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    for (const label of [t.last24.chats, t.last24.messages, t.last24.bookings, t.last24.flagged]) {
      expect(screen.getByRole("button", { name: `What does ${label} mean?` })).toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: t.last24.title }).className).toContain("people-tint");
  });

  it("opens the Inbox's Answered by the AI from Chats answered, a link named by its number and where it leads", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    const link = await screen.findByRole("link", { name: "Chats answered: 12, in the Inbox" });
    expect(link).toHaveAttribute("href", "/inbox?show=ai-answered");
    // Its words, stretched over the cell, whose focus outline goes round the cell; the ⓘ stays its own button.
    expect(link).toHaveTextContent(t.last24.chats);
    expect(link.closest("[data-figure-link]")).not.toBeNull();
    expect(within(screen.getByRole("group", { name: t.last24.chats })).getByRole("button")).toBeInTheDocument();
    for (const label of [t.last24.messages, t.last24.bookings, t.last24.flagged]) {
      expect(within(screen.getByRole("group", { name: label })).queryByRole("link")).not.toBeInTheDocument();
    }
  });

  it("keeps Chats answered a figure for a member who doesn't see the Inbox", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), member({ permissions: ["ai:manage"] }));
    await screen.findByText("12");
    expect(within(screen.getByRole("group", { name: t.last24.chats })).queryByRole("link")).not.toBeInTheDocument();
  });

  it("puts a line between the strip's two rows on a phone", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    await screen.findByText(t.last24.bookings);
    expect(document.querySelector('[data-slot="separator"].md\\:hidden')).not.toBeNull();
  });
});

describe("what needs you", () => {
  /** A tile by its words: its count, whether it is amber, and its button. */
  const tile = (label: string) => {
    const words = screen.getByText(label);
    const box = words.closest('[data-slot="item"]');
    if (!(box instanceof HTMLElement)) throw new Error(`no tile for ${label}`);
    return box;
  };

  it("counts everything waiting in its title, each tile amber with its count and its button", async () => {
    api({
      "ai.handedOver": chatsOf(handed),
      "ai.stageSuggestions": suggestionsOf([suggestion]),
      "paymentsToCheck.count": { count: 3 },
    });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByRole("heading", { name: "Needs you · 5" })).toBeInTheDocument();
    const chats = tile(t.needsYou.tiles.handedOver);
    expect(chats).toHaveTextContent("1");
    expect(chats.className).toContain("status-attention");
    expect(within(chats).getByRole("link", { name: t.needsYou.show.handedOver })).toHaveAttribute(
      "href",
      "#needs-you-handed-over",
    );
    const suggestions = tile(t.needsYou.tiles.suggestions);
    expect(within(suggestions).getByRole("link", { name: t.needsYou.show.suggestions })).toHaveAttribute(
      "href",
      "#needs-you-suggestions",
    );
    const payments = tile(t.needsYou.tiles.payments);
    expect(payments).toHaveTextContent("3");
    expect(within(payments).getByRole("link", { name: t.needsYou.show.payments })).toHaveAttribute("href", "/payments");
    // The buttons' lists are just below, under their headings.
    expect(document.getElementById("needs-you-handed-over")).toHaveTextContent("Meera Rao");
    expect(document.getElementById("needs-you-suggestions")).toHaveTextContent("Rahul Verma");
    expect(screen.queryByText(t.needsYou.nothing)).not.toBeInTheDocument();
  });

  it("keeps a tile with nothing waiting quiet, with no button to an empty list", async () => {
    api({ "paymentsToCheck.count": { count: 2 } });
    renderWithApi(<AgentScreen />, client(), owner);
    await screen.findByRole("heading", { name: "Needs you · 2" });
    const chats = tile(t.needsYou.tiles.handedOver);
    expect(chats).toHaveTextContent("0");
    expect(chats.className).not.toContain("status-attention");
    expect(within(chats).queryByRole("link")).not.toBeInTheDocument();
    expect(tile(t.needsYou.tiles.payments).className).toContain("status-attention");
  });

  it("says nothing needs you when nothing does, its tiles quiet; Payments to check still opens its page", async () => {
    api();
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByText(t.needsYou.nothing)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t.needsYou.title })).toBeInTheDocument();
    for (const label of Object.values(t.needsYou.tiles))
      expect(tile(label).className).not.toContain("status-attention");
    expect(within(tile(t.needsYou.tiles.handedOver)).queryByRole("link")).not.toBeInTheDocument();
    expect(within(tile(t.needsYou.tiles.suggestions)).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(tile(t.needsYou.tiles.payments)).getByRole("link", { name: t.needsYou.show.payments }),
    ).toHaveAttribute("href", "/payments");
  });

  it("counts every one waiting, past the 20 each list shows", async () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...handed[0],
        conversationId: `0199a000-0000-7000-8000-0000000001${String(index).padStart(2, "0")}`,
      }));
    const suggestions = Array.from({ length: 20 }, (_, index) => ({
      ...suggestion,
      id: `0199a000-0000-7000-8000-0000000002${String(index).padStart(2, "0")}`,
    }));
    api({ "ai.handedOver": chatsOf(many(20), 25), "ai.stageSuggestions": suggestionsOf(suggestions, 21) });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByRole("heading", { name: "Needs you · 46" })).toBeInTheDocument();
    expect(tile(t.needsYou.tiles.handedOver)).toHaveTextContent("25");
    expect(tile(t.needsYou.tiles.suggestions)).toHaveTextContent("21");
  });

  it("lists the handed-over chats, each opening the chat in the inbox", async () => {
    api({ "ai.handedOver": chatsOf(handed) });
    renderWithApi(<AgentScreen />, client(), owner);
    const link = await screen.findByRole("link", { name: "Meera Rao" });
    expect(link).toHaveAttribute("href", `/inbox/${conversationId}`);
    expect(screen.getByText("Asked for a discount")).toBeInTheDocument();
  });

  it("shows a chat that has no name by its phone number, spaced the Indian way", async () => {
    api({ "ai.handedOver": chatsOf([{ ...handed[0], name: "+919876543210" }]) });
    renderWithApi(<AgentScreen />, client(), owner);
    expect(await screen.findByRole("link", { name: "+91 98765 43210" })).toBeInTheDocument();
  });

  it("lists the AI's Lost suggestions, each with its lead, reason and buttons", async () => {
    const stub = api({
      "ai.handedOver": chatsOf(handed),
      "ai.stageSuggestions": suggestionsOf([suggestion]),
      "ai.decideStageSuggestion": null,
    });
    renderWithApi(<AgentScreen />, client(), owner);
    const link = await screen.findByRole("link", { name: "Rahul Verma" });
    expect(link).toHaveAttribute("href", `/leads/${suggestion.leadId}`);
    expect(screen.getByText("Lost: Said they're not interested.")).toBeInTheDocument();
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

  it("shows and counts only what the member may act on, and never asks for the rest", async () => {
    const stub = api({ "paymentsToCheck.count": { count: 3 }, "ai.handedOver": chatsOf(handed) });
    renderWithApi(<AgentScreen />, client(), member({ permissions: ["ai:manage"] }));
    expect(await screen.findByText(t.needsYou.nothing)).toBeInTheDocument();
    for (const label of Object.values(t.needsYou.tiles)) expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.queryByText("Meera Rao")).not.toBeInTheDocument();
    expect(stub.calls).not.toContain("paymentsToCheck.count");
    expect(stub.calls).not.toContain("ai.handedOver");
    expect(stub.calls).not.toContain("ai.stageSuggestions");
  });
});
