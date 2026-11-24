// Who has the chat, said over the reply box and at the foot of the messages: the bar names the AI or the person, the reason
// it flagged, and the one button that hands the chat the other way; the typing bubble shows while the AI reads or writes.
import type { ChatAi } from "@travel-crm/contracts/ai";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AiReplyBar, AiTyping } from "@/ai/ai-turn";
import { cardTints } from "@/components/card-tints";
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
  numberOff: false,
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
  it("is one violet line that says the AI answers and when it follows up, with Take over", async () => {
    render({ followUpAt: "2026-11-24T10:30:00.000Z", followUpReason: "asked to think" }, "bar");
    const line = await screen.findByText(/^AI answering · follows up .*4:00 pm/);
    expect(line).toHaveClass("line-clamp-1");
    expect(line.closest("[data-slot=collapsible]")).toHaveClass(cardTints.ai);
    expect(screen.queryByText(/Riya/)).toBeNull();
    const take = screen.getByRole("button", { name: t.takeOver });
    expect(take).toBeEnabled();
    expect(take).toHaveClass("min-h-11");
  });

  it("opens the rest, the follow-up's why, when the line is tapped", async () => {
    const user = userEvent.setup();
    render({ followUpAt: "2026-11-24T10:30:00.000Z", followUpReason: "asked to think" }, "bar");
    expect(screen.queryByText(/asked to think/)).toBeNull();
    await user.click(await screen.findByText(/^AI answering · follows up/));
    expect(await screen.findByText(/asked to think/)).toBeVisible();
  });

  it("says why it flagged a chat while it keeps answering, amber and bold like a hand-over (owner, 2026-11-24)", async () => {
    render({ attention: "wants to book for 4 on 12 Dec" }, "bar");
    const line = await screen.findByText("AI answering · flagged: wants to book for 4 on 12 Dec");
    expect(line.closest("[data-slot=collapsible]")).toHaveClass(cardTints.attention);
    expect(line).toHaveClass("font-semibold");
  });

  it("says the AI is paused till the time because you replied, violet, with Let AI answer now", async () => {
    render({ personPausedUntil: "2026-11-24T09:18:00.000Z" }, "bar");
    const line = await screen.findByText(/^The AI is paused till .* because you replied$/);
    expect(line.closest("[data-slot=collapsible]")).toHaveClass(cardTints.ai);
    expect(screen.getByRole("button", { name: t.answerNow })).toBeVisible();
  });

  it("says a chat was handed over in amber and bold, with the reason and Let AI answer", async () => {
    render({ answering: false, handedOff: true, handoffReason: "asked for a person" }, "bar");
    const line = await screen.findByText("Over to you: asked for a person");
    expect(line).toHaveClass("font-semibold");
    expect(line.closest("[data-slot=collapsible]")).toHaveClass(cardTints.attention);
    expect(screen.getByRole("button", { name: t.letAnswer })).toBeVisible();
  });

  it("opens a long hand-over reason in full while the line stays one line", async () => {
    const user = userEvent.setup();
    const reason = "asked for a refund on the Spiti trip and wants to speak to the owner about the cancellation terms";
    render({ answering: false, handedOff: true, handoffReason: reason }, "bar");
    const line = await screen.findByText(`Over to you: ${reason}`);
    expect(line).toHaveClass("line-clamp-1");
    await user.click(line);
    expect(await screen.findAllByText(`Over to you: ${reason}`)).toHaveLength(2);
  });

  it("says the AI is off in this chat, quiet, with Let AI answer", async () => {
    render({ answering: false, mode: "off" }, "bar");
    const line = await screen.findByText(t.barOff);
    expect(line.closest("[data-slot=collapsible]")).not.toHaveClass(cardTints.ai);
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
