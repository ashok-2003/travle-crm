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
  handedOff: false,
  handoffReason: null,
  memory: "",
  lastReplyAt: null,
  turn: null,
  followUpAt: null,
  followUpReason: null,
  attention: null,
  personPausedUntil: null,
  voice: null,
  persona: "default",
  agentName: "Riya from Sharma Holidays",
  available: true,
};
const t = messages.ai.chat;

function render(state: Partial<ChatAi>, view: "bar" | "typing") {
  const { calls } = stubApi({ "ai.chatAi": { data: { ...chat, ...state } } });
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
  const me = member({ permissions: ["ai:suggest", "inbox:view", "inbox:reply"] });
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
