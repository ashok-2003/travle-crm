// The inbox's AI card shows the lite agent's notes on the customer under "What the AI noted", and nothing when it has none.
import type { ChatAi } from "@travel-crm/contracts/ai";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatAiCard } from "@/ai/chat-ai-card";
import { messages } from "@/i18n/messages";
import { paidSubscription } from "../organization/api";
import { renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";

const chat: ChatAi = {
  mode: "default",
  answering: true,
  handedOff: false,
  handoffReason: null,
  summary: "",
  turn: null,
  followUpAt: null,
  followUpReason: null,
  attention: null,
  personPausedUntil: null,
  agentName: "Riya",
  available: true,
};

function show(state: Partial<ChatAi>) {
  stubApi({ "ai.chatAi": { data: { ...chat, ...state } } });
  renderScreen(<ChatAiCard conversationId="chat-1" />, {
    subscription: { ...paidSubscription, modules: ["crm", "inbox", "ai"] as never },
  });
}

describe("ChatAiCard, what the AI noted", () => {
  it("shows the summary under its heading", async () => {
    show({ summary: "Wants a Kashmir trek in May." });
    expect(await screen.findByText("Wants a Kashmir trek in May.")).toBeVisible();
    expect(screen.getByRole("heading", { name: messages.ai.chat.noted })).toBeVisible();
  });

  it("shows nothing when the summary is empty", async () => {
    show({});
    await screen.findByText(messages.ai.chat.answering);
    expect(screen.queryByRole("heading", { name: messages.ai.chat.noted })).not.toBeInTheDocument();
  });

  it("has no way-of-talking panel", async () => {
    show({});
    await screen.findByText(messages.ai.chat.answering);
    expect(screen.queryByRole("heading", { name: /way of talking/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export|learn/i })).not.toBeInTheDocument();
  });

  it("keeps the state, the hand-over reason with its button, the mode toggle and the summary", async () => {
    show({ answering: false, handedOff: true, handoffReason: "Asked for a discount", summary: "Wants Goa in May." });
    expect(await screen.findByText(messages.ai.chat.handedOff)).toBeVisible();
    expect(screen.getByText(messages.ai.chat.handoffTitle)).toBeVisible();
    expect(screen.getByText("Asked for a discount")).toBeVisible();
    expect(screen.getByRole("button", { name: messages.ai.chat.resume })).toBeVisible();
    expect(screen.getByRole("radio", { name: messages.ai.chat.modes.on })).toBeVisible();
    expect(screen.getByText("Wants Goa in May.")).toBeVisible();
  });

  it("leaves the person-paused, flagged and follow-up lines to the bar over the reply box", async () => {
    show({
      personPausedUntil: "2026-11-12T10:00:00.000Z",
      attention: "Wants to book",
      followUpAt: "2026-11-13T10:00:00.000Z",
      followUpReason: "Waiting for dates",
    });
    await screen.findByText(messages.ai.chat.answering);
    // What the bar over the reply box says is not repeated here: neither the flag's words nor the follow-up's reason.
    expect(screen.queryByText("Wants to book")).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for dates/)).not.toBeInTheDocument();
    expect(screen.queryByText(/10:00|3:30/)).not.toBeInTheDocument();
  });
});
