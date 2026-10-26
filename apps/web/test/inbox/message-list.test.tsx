// The chat's message list (audit 8, 10): "N unread messages" above the first one the member had not read when the chat opened,
// with the read mark sent only once the list is fresh; a quote that points past what is loaded fetches older pages and scrolls
// to the original; a voice note and a place show their own cards.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationCard } from "@/inbox/media/location-card";
import { VoiceNotePlayer } from "@/inbox/media/voice-note-player";
import { MessageList } from "@/inbox/message-list";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aMessage, answerApi } from "./answer-api";

const chatId = "01900000-0000-7000-8000-00000000000a";
const id = (n: number) => `01900000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`;
const at = (minute: number) => `2026-10-26T10:${String(minute).padStart(2, "0")}:00.000Z`;
const header = {
  id: chatId,
  phone: "+919876543210",
  name: "Rahul Mehta",
  personId: null,
  lead: null,
  pastCustomer: false,
  windowOpenUntil: "2099-01-01T00:00:00.000Z",
  lastInboundAt: at(5),
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
const notes = { items: [], people: {} };
const scrollIntoView = vi.fn();

describe("the message list", () => {
  beforeEach(() => {
    screenIs("wide");
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws the unread divider above the first unread message, and marks the chat read once the list is fresh", async () => {
    const api = answerApi({
      "inbox.conversation": header,
      "salesInbox.notes": notes,
      "inbox.markRead": null,
      "inbox.messages": {
        items: [
          aMessage({ id: id(3), body: "And dates?", occurredAt: at(5) }),
          aMessage({ id: id(2), body: "Price?", occurredAt: at(4) }),
          aMessage({ id: id(1), body: "Hello", occurredAt: at(1) }),
        ],
        nextCursor: null,
        people: {},
        unread: { count: 2, firstMessageId: id(2) },
      },
    });
    renderWithApi(<MessageList conversationId={chatId} />, newQueryClient());
    expect(await screen.findByText("2 unread messages")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((row) => row.textContent);
    const divider = rows.findIndex((text) => text.includes("2 unread messages"));
    expect(rows[divider + 1]).toContain("Price?");
    expect(rows[divider - 1]).toContain("Hello");
    await waitFor(() => {
      expect(api.of("inbox.markRead")).toHaveLength(1);
    });
  });

  it("loads older pages until a quoted message is found, then scrolls to it", async () => {
    const original = aMessage({ id: id(1), body: "Goa in December?", occurredAt: at(1) });
    const api = answerApi({
      "inbox.conversation": header,
      "salesInbox.notes": notes,
      "inbox.markRead": null,
      "inbox.messages": (input: unknown) =>
        (input as { before?: string }).before === undefined
          ? {
              items: [
                aMessage({
                  id: id(9),
                  direction: "out",
                  origin: "staff_crm",
                  status: "sent",
                  body: "Yes, from ₹12,000",
                  occurredAt: at(5),
                  quoted: {
                    messageId: id(1),
                    direction: "in",
                    sentBy: null,
                    kind: "text",
                    body: "Goa in December?",
                    fileName: null,
                    mediaState: "none",
                  },
                }),
              ],
              nextCursor: id(9),
              people: {},
              unread: { count: 0, firstMessageId: null },
            }
          : { items: [original], nextCursor: null, people: {}, unread: null },
    });
    renderWithApi(<MessageList conversationId={chatId} />, newQueryClient());
    await userEvent.click(await screen.findByRole("button", { name: "Go to the message from Rahul Mehta" }));
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    expect(api.of("inbox.messages")).toHaveLength(2);
    // The original is in the list now, and flashes while it is jumped to.
    const target = document.querySelector(`[data-message-id="${id(1)}"]`);
    expect(target).not.toBeNull();
    expect(target?.className).toContain("bg-chat-date-chip");
  });
});

describe("a voice note and a place", () => {
  beforeEach(() => {
    screenIs("wide");
  });

  it("plays and pauses a voice note, shows its length and cycles its speed", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"));
    });
    renderWithApi(<VoiceNotePlayer url="https://files.example/v.ogg" />, newQueryClient());
    const audio = document.querySelector("audio");
    if (audio === null) throw new Error("no audio element");
    Object.defineProperty(audio, "duration", { value: 65, configurable: true });
    audio.dispatchEvent(new Event("loadedmetadata"));
    expect(await screen.findByText(/0:00 \/ 1:05/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play the voice message" }));
    expect(play).toHaveBeenCalledTimes(1);
    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /Speed 1x/ }));
    expect(audio.playbackRate).toBe(1.5);
    await userEvent.click(screen.getByRole("button", { name: /Speed 1.5x/ }));
    expect(audio.playbackRate).toBe(2);
    play.mockRestore();
    pause.mockRestore();
  });

  it("shows a place's coordinates with a link that opens Maps in another tab", () => {
    renderWithApi(<LocationCard latitude={19.076} longitude={72.8777} />, newQueryClient());
    const link = screen.getByRole("link", { name: "Open in Maps" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("19.076");
    expect(screen.getByText("Location")).toBeInTheDocument();
  });
});
