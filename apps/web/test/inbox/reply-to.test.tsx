// Reply-to in the browser (audit 8), the message info and Discard: a quote names who wrote the original and goes to it when
// tapped, or says the original is not available; a message picked from its menu is quoted by the next reply, shown above the
// box until it is sent or dropped; the info lists when a message was sent, delivered and read; a failed message can be
// discarded.
import type { ChatMessage, ConversationHeader } from "@travel-crm/contracts/inbox";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatJumpContext } from "@/inbox/chat-jump";
import { Composer } from "@/inbox/composer";
import { MessageBubble } from "@/inbox/message-bubble";
import { ReplyingProvider } from "@/inbox/use-replying";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aMessage, answerApi } from "./answer-api";

const chatId = "01900000-0000-7000-8000-00000000000a";
const theirs = "01900000-0000-7000-8000-0000000000a1";
const ours = "01900000-0000-7000-8000-0000000000b2";

const header: ConversationHeader = {
  id: chatId,
  phone: "+919876543210",
  name: "Rahul Mehta",
  personId: null,
  lead: null,
  pastCustomer: false,
  windowOpenUntil: "2099-01-01T00:00:00.000Z",
  lastInboundAt: "2026-10-26T10:00:00.000Z",
  needsReply: false,
  trip: { destination: null, travelMonth: null },
  optedOut: false,
  agreed: true,
  state: "open",
  tags: [],
  pinned: false,
  archived: false,
  snoozedUntil: null,
  replying: [],
};

const message = (fields: Record<string, unknown>) => aMessage(fields) as ChatMessage;
const bubble = (chat: ChatMessage, quotedSender = "Rahul Mehta") => (
  <MessageBubble message={chat} senderName={null} quotedSender={quotedSender} first />
);

describe("a quote in a bubble", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names who wrote the original and shows its words, and goes to it when tapped", async () => {
    answerApi({});
    const jumpTo = vi.fn();
    renderWithApi(
      <ChatJumpContext.Provider value={{ jumpTo, highlightId: null }}>
        {bubble(
          message({
            id: ours,
            body: "Yes, from ₹12,000",
            quoted: {
              messageId: theirs,
              direction: "in",
              sentBy: null,
              kind: "text",
              body: "Goa in December?",
              fileName: null,
              mediaState: "none",
            },
          }),
        )}
      </ChatJumpContext.Provider>,
      newQueryClient(),
    );
    const quote = screen.getByRole("button", { name: "Go to the message from Rahul Mehta" });
    expect(within(quote).getByText("Goa in December?")).toBeInTheDocument();
    await userEvent.click(quote);
    expect(jumpTo).toHaveBeenCalledWith(theirs);
  });

  it("says when the original is not available, and names the kind for a picture", () => {
    answerApi({});
    renderWithApi(
      <>
        {bubble(
          message({
            id: ours,
            quoted: {
              messageId: null,
              direction: null,
              sentBy: null,
              kind: null,
              body: null,
              fileName: null,
              mediaState: null,
            },
          }),
        )}
        {bubble(
          message({
            id: theirs,
            quoted: {
              messageId: ours,
              direction: "out",
              sentBy: null,
              kind: "video",
              body: null,
              fileName: null,
              mediaState: "none",
            },
          }),
          "Asha",
        )}
      </>,
      newQueryClient(),
    );
    expect(screen.getByText("Original message not available")).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Go to the message from Asha" })).getByText("Video"),
    ).toBeInTheDocument();
  });

  it("says a message went without its quote", () => {
    answerApi({});
    renderWithApi(
      bubble(message({ direction: "out", origin: "staff_crm", status: "sent", quoteDropped: true })),
      newQueryClient(),
    );
    expect(screen.getByText("Sent without the quote")).toBeInTheDocument();
  });
});

describe("replying with a quote", () => {
  beforeEach(() => {
    screenIs("wide");
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const chatWithBox = () =>
    renderWithApi(
      <ReplyingProvider conversationId={chatId}>
        {bubble(message({ id: theirs, body: "Goa in December?" }))}
        <Composer header={header} windowOpenUntil="2099-01-01T00:00:00.000Z" />
      </ReplyingProvider>,
      newQueryClient(),
    );

  it("quotes the chosen message in the next reply, then forgets it", async () => {
    const api = answerApi({ "inbox.send": { messageId: ours, status: "queued" } });
    chatWithBox();
    await userEvent.click(screen.getByRole("button", { name: "More for this message" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reply" }));
    expect(screen.getByText("Replying to Rahul Mehta")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("combobox", { name: "Message" }), "Yes, from ₹12,000");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(api.of("inbox.send")).toHaveLength(1);
    });
    expect(api.of("inbox.send")[0]?.input).toMatchObject({ text: "Yes, from ₹12,000", replyToMessageId: theirs });
    await waitFor(() => {
      expect(screen.queryByText("Replying to Rahul Mehta")).toBeNull();
    });
  });

  it("drops the quote when its cross is pressed", async () => {
    const api = answerApi({ "inbox.send": { messageId: ours, status: "queued" } });
    chatWithBox();
    await userEvent.click(screen.getByRole("button", { name: "More for this message" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reply" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop replying to this message" }));
    expect(screen.queryByText("Replying to Rahul Mehta")).toBeNull();
    await userEvent.type(screen.getByRole("combobox", { name: "Message" }), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(api.of("inbox.send")).toHaveLength(1);
    });
    expect(api.of("inbox.send")[0]?.input).not.toHaveProperty("replyToMessageId");
  });

  it("swipes right on a touch screen to answer a message", async () => {
    answerApi({});
    chatWithBox();
    const row = document.querySelector(`[data-message-id="${theirs}"]`);
    if (row === null) throw new Error("no bubble");
    const touch = (x: number, y: number) => ({ clientX: x, clientY: y, identifier: 1, target: row });
    row.dispatchEvent(Object.assign(new Event("touchstart", { bubbles: true }), { touches: [touch(10, 10)] }));
    row.dispatchEvent(Object.assign(new Event("touchend", { bubbles: true }), { changedTouches: [touch(120, 14)] }));
    expect(await screen.findByText("Replying to Rahul Mehta")).toBeInTheDocument();
  });
});

describe("message info and Discard", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists when our message was sent, delivered and read", async () => {
    answerApi({});
    renderWithApi(
      bubble(
        message({
          direction: "out",
          origin: "staff_crm",
          status: "read",
          sentAt: "2026-10-26T10:01:00.000Z",
          deliveredAt: "2026-10-26T10:02:00.000Z",
          readAt: null,
        }),
      ),
      newQueryClient(),
    );
    await userEvent.click(screen.getByRole("button", { name: "More for this message" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Message info" }));
    const info = await screen.findByRole("dialog");
    expect(within(info).getByText("Sent")).toBeInTheDocument();
    expect(within(info).getByText("Delivered")).toBeInTheDocument();
    expect(within(info).getByText("Not yet")).toBeInTheDocument();
  });

  it("discards a message that was not sent", async () => {
    const api = answerApi({ "inbox.discard": null });
    renderWithApi(
      bubble(message({ id: ours, direction: "out", origin: "staff_crm", status: "failed", failureCode: "unsure" })),
      newQueryClient(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => {
      expect(api.of("inbox.discard")).toHaveLength(1);
    });
    expect(api.of("inbox.discard")[0]?.input).toEqual({ messageId: ours });
  });
});
