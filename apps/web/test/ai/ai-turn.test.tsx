// Who has the chat, said over the reply box and at the foot of the messages: the bar names the AI or the person, the reason
// it flagged, and the one button that hands the chat the other way; the typing bubble shows while the AI reads or writes.
import type { ChatAi } from "@travel-crm/contracts/ai";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiReplyBar, AiTyping } from "@/ai/ai-turn";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const chat: ChatAi = {
  mode: "default",
  answering: true,
  agent: "ready",
  handedOff: false,
  handoffReason: null,
  summary: "",
  turn: null,
  followUpAt: null,
  followUpReason: null,
  attention: null,
  personPausedUntil: null,
  agentName: "Riya from Sharma Holidays",
  available: true,
};
const t = messages.ai.chat;

function render(state: Partial<ChatAi>, view: "bar" | "typing", extra: "ai:manage"[] = []) {
  const { calls } = stubApi({ "ai.chatAi": { data: { ...chat, ...state } } });
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
  const me = member({ permissions: ["ai:suggest", "inbox:view", "inbox:reply", ...extra] });
  renderWithApi(
    view === "bar" ? (
      <AiReplyBar conversationId="chat-1" />
    ) : (
      <ol>
        <AiTyping conversationId="chat-1" />
      </ol>
    ),
    queryClient,
    me,
  );
  return calls;
}

describe("the AI bar over the reply box", () => {
  it("says the AI is answering, by its first name, with Take over", async () => {
    render({}, "bar");
    expect(await screen.findByText("Riya is answering this chat. If you write, it waits 10 minutes.")).toBeVisible();
    expect(screen.getByRole("button", { name: t.takeOver })).toBeEnabled();
  });

  it("says why it flagged a chat while it keeps answering", async () => {
    render({ attention: "wants to book for 4 on 12 Dec" }, "bar");
    expect(
      await screen.findByText("Riya flagged: wants to book for 4 on 12 Dec. It's still answering; join any time."),
    ).toBeVisible();
  });

  it("says a chat was handed over, with the reason and Let AI answer", async () => {
    render({ answering: false, handedOff: true, handoffReason: "asked for a person" }, "bar");
    expect(await screen.findByText("Over to you: asked for a person")).toBeVisible();
    expect(screen.getByRole("button", { name: t.letAnswer })).toBeVisible();
  });

  it("says the AI is off in this chat, with Let AI answer", async () => {
    render({ answering: false, mode: "off" }, "bar");
    expect(await screen.findByText(t.barOff)).toBeVisible();
    expect(screen.getByRole("button", { name: t.letAnswer })).toBeVisible();
  });

  it("says the agency's agent is off in place of Let AI answer, with the way to the AI agent page", async () => {
    render({ mode: "on", answering: false, agent: "off" }, "bar", ["ai:manage"]);
    expect(await screen.findByText(t.agentOff)).toBeVisible();
    expect(screen.getByRole("link", { name: t.agentLink })).toHaveAttribute("href", "/ai-agent");
    expect(screen.queryByRole("button", { name: t.letAnswer })).toBeNull();
    expect(screen.queryByText(/is answering this chat/)).toBeNull();
  });

  it("says the agency's agent isn't set up yet, even in a chat it handed over", async () => {
    render({ answering: false, agent: "not_ready", handedOff: true, handoffReason: "asked for a person" }, "bar");
    expect(await screen.findByText(t.agentNotReady)).toBeVisible();
    expect(screen.queryByRole("button", { name: t.letAnswer })).toBeNull();
    // Only whoever manages the AI can open its page.
    expect(screen.queryByRole("link", { name: t.agentLink })).toBeNull();
  });

  it("is not there where the AI is not available", async () => {
    const calls = render({ available: false }, "bar");
    await waitFor(() => {
      expect(calls).toContain("ai.chatAi");
    });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the AI's typing bubble", () => {
  it("shows while it writes its answer, and while it waits for the next line", async () => {
    render({ turn: "thinking" }, "typing");
    expect(await screen.findByText("Riya (AI) is typing…")).toBeVisible();
  });

  it("shows nothing between turns", async () => {
    const calls = render({}, "typing");
    await waitFor(() => {
      expect(calls).toContain("ai.chatAi");
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
