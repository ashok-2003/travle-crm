// A chat opens at once (inbox revamp spec, part 1 item 3): its page, header and newest page of messages are asked for as
// the pointer rests on its row, or at once as the row gets the focus; a pointer only passing over asks nothing, a chat
// asked for a moment ago is not asked for again, and, while the live stream is on, not again as it opens either.
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationList, PREFETCH_REST_MS } from "@/inbox/conversation-list";
import { streamConnected } from "@/inbox/live-state";
import { MessageList } from "@/inbox/message-list";
import { newQueryClient, renderWithApi } from "../organization/api";
import { answerApi } from "./answer-api";

const router = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const chat = (n: number): ConversationListItem => ({
  id: `01900000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`,
  connectionId: "01900000-0000-7000-8000-0000000000aa",
  phone: "+919876543210",
  name: n === 1 ? "Meera Rao" : "Amit Shah",
  personId: null,
  preview: "Hello",
  lastMessageAt: "2026-10-26T10:00:00.000Z",
  needsReply: false,
  isNewNumber: false,
  lastDirection: "in",
  lastStatus: null,
  lead: null,
  tags: [],
  pinned: false,
  archived: false,
  unread: 0,
  waitingSince: null,
  snoozedUntil: null,
});

describe("asking for a chat ahead", () => {
  let api: ReturnType<typeof answerApi>;
  beforeEach(() => {
    router.prefetch.mockClear();
    api = answerApi({
      "inbox.conversation": (input: unknown) => ({
        id: (input as { conversationId: string }).conversationId,
        phone: "+919876543210",
        name: "Meera Rao",
        personId: null,
        lead: null,
        pastCustomer: false,
        liveLead: null,
        windowOpenUntil: null,
        lastInboundAt: null,
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
        number: { id: "01900000-0000-7000-8000-0000000000f1", label: "WhatsApp", status: "connected" },
        otherChats: [],
      }),
      "salesInbox.notes": { items: [], people: {} },
      "inbox.markRead": null,
      "inbox.messages": { items: [], nextCursor: null, people: {}, unread: null },
      "leads.owners": [],
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const asked = () => [...api.of("inbox.conversation"), ...api.of("inbox.messages")].map((call) => call.input);

  it("asks for a row's chat once the pointer has rested on it, and not for one it only passed over", async () => {
    renderWithApi(<ConversationList items={[chat(1), chat(2)]} currentId={null} />, newQueryClient());
    const passed = screen.getByRole("link", { name: /Amit Shah/ });
    fireEvent.pointerEnter(passed);
    fireEvent.pointerLeave(passed);
    const rested = screen.getByRole("link", { name: /Meera Rao/ });
    fireEvent.pointerEnter(rested);
    await new Promise((resolve) => setTimeout(resolve, PREFETCH_REST_MS + 50));
    await waitFor(() => {
      expect(asked()).toEqual([{ conversationId: chat(1).id }, { conversationId: chat(1).id }]);
    });
    expect(router.prefetch.mock.calls).toEqual([[`/inbox/${chat(1).id}`]]);
  });

  it("asks at once when the row gets the focus, and not again a moment later", async () => {
    renderWithApi(<ConversationList items={[chat(1), chat(2)]} currentId={null} />, newQueryClient());
    const row = screen.getByRole("link", { name: /Amit Shah/ });
    fireEvent.focus(row);
    await waitFor(() => {
      expect(asked()).toEqual([{ conversationId: chat(2).id }, { conversationId: chat(2).id }]);
    });
    fireEvent.blur(row);
    fireEvent.focus(row);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked()).toHaveLength(2);
  });

  it("doesn't ask again as the chat opens, a moment later, while the live stream is on", async () => {
    streamConnected(true);
    try {
      const queryClient = newQueryClient();
      const list = renderWithApi(<ConversationList items={[chat(1)]} currentId={null} />, queryClient);
      fireEvent.focus(screen.getByRole("link", { name: /Meera Rao/ }));
      await waitFor(() => {
        expect(asked()).toHaveLength(2);
      });
      list.unmount();
      renderWithApi(<MessageList conversationId={chat(1).id} />, queryClient);
      await screen.findByText("No messages yet.");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(asked()).toHaveLength(2);
    } finally {
      streamConnected(false);
    }
  });
});
