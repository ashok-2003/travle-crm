// Switching chats on a phone, where one ChatPanel stays on screen as the address changes: each chat shows its own half-written
// words, and one chat's words are never written under another's key (a forward from A to B showed A's draft in B).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/inbox/chat-panel";
import { draftKey } from "@/inbox/forward-dialog";
import { readTabValue } from "@/lib/tab-storage";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { answerApi } from "./answer-api";

const chatA = "01900000-0000-7000-8000-00000000000a";
const chatB = "01900000-0000-7000-8000-00000000000b";
const header = (id: string) => ({
  id,
  phone: "+919876543210",
  name: id === chatA ? "Meera Rao" : "Amit Shah",
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
});

describe("switching chats on a phone", () => {
  beforeEach(() => {
    screenIs("phone");
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows each chat its own words and writes none under the other's key", async () => {
    answerApi({
      "inbox.conversation": (input: unknown) => header((input as { conversationId: string }).conversationId),
      "inbox.messages": { items: [], nextCursor: null, people: {}, unread: null },
      "salesInbox.notes": { items: [], people: {} },
    });
    window.sessionStorage.setItem(`travel-crm.${draftKey(chatB)}`, "Forwarded to Amit");
    const first = renderWithApi(<ChatPanel conversationId={chatA} variant="page" />, newQueryClient());
    const box = async () => screen.findByRole("combobox", { name: "Message" });
    await userEvent.type(await box(), "Words for Meera");
    expect(readTabValue(draftKey(chatA))).toBe("Words for Meera");

    // The address changes to B: the same panel, new chat.
    first.rerender(<ChatPanel conversationId={chatB} variant="page" />);
    await waitFor(async () => {
      expect(await box()).toHaveValue("Forwarded to Amit");
    });
    expect(readTabValue(draftKey(chatA))).toBe("Words for Meera");
    expect(readTabValue(draftKey(chatB))).toBe("Forwarded to Amit");

    first.rerender(<ChatPanel conversationId={chatA} variant="page" />);
    await waitFor(async () => {
      expect(await box()).toHaveValue("Words for Meera");
    });
  });
});
