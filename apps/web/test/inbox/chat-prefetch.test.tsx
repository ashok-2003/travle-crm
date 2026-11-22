// A chat opens at once (inbox revamp spec, part 1 item 3): its header and newest page of messages are asked for as the
// pointer rests on its row, or at once as the row gets the focus; a pointer only passing over asks nothing, and a chat
// asked for a moment ago is not asked for again.
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationList, PREFETCH_REST_MS } from "@/inbox/conversation-list";
import { newQueryClient, renderWithApi } from "../organization/api";
import { answerApi } from "./answer-api";

const chat = (n: number): ConversationListItem => ({
  id: `01900000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`,
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
    api = answerApi({
      "inbox.conversation": {},
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
});
