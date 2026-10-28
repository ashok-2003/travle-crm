// Forwarding a message's words (sales inbox spec, design v2): choosing a chat asks the api to note it in the audit log, and
// only once that is done do the words wait in the other chat's reply box (the tab's storage, never the address) and the
// screen move there. A refusal leaves no draft behind.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftKey, ForwardDialog } from "@/inbox/forward-dialog";
import { readTabValue } from "@/lib/tab-storage";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const chatId = "01900000-0000-7000-8000-0000000000a1";
const messageId = "01900000-0000-7000-8000-0000000000b2";
const chat = {
  id: chatId,
  phone: "+919876543210",
  name: "Meera Rao",
  personId: null,
  preview: "Hello",
  lastMessageAt: null,
  needsReply: false,
  isNewNumber: false,
  lastDirection: null,
  lastStatus: null,
  lead: null,
  tags: [],
  pinned: false,
  archived: false,
  unread: 0,
  waitingSince: null,
  snoozedUntil: null,
};

async function chooseMeera(api: ReturnType<typeof fakeApi>) {
  renderWithApi(
    <ForwardDialog messageId={messageId} words="Kerala, 5 nights" open onOpenChange={vi.fn()} />,
    newQueryClient(),
  );
  await waitFor(() => {
    expect(api.calls.map((call) => call.path)).toContain("inbox.conversations");
  });
  api.calls.find((call) => call.path === "inbox.conversations")?.answer({ items: [chat], nextCursor: null });
  await userEvent.click(await screen.findByRole("button", { name: /Meera Rao/ }));
}

describe("forwarding a message", () => {
  beforeEach(() => {
    screenIs("wide");
    push.mockClear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the words in the other chat's box and opens it, once the api has audited the forward", async () => {
    const api = fakeApi();
    await chooseMeera(api);
    const forward = api.calls.find((call) => call.path === "salesInbox.forward");
    expect(forward?.input).toEqual({ messageId, toConversationId: chatId });
    expect(readTabValue(draftKey(chatId))).toBeNull();
    forward?.answer(null);
    await waitFor(() => {
      expect(push).toHaveBeenCalled();
    });
    expect(readTabValue(draftKey(chatId))).toBe("Kerala, 5 nights");
    expect(window.localStorage.length).toBe(0);
  });

  it("leaves no draft behind when the api refuses", async () => {
    const api = fakeApi();
    await chooseMeera(api);
    api.calls.find((call) => call.path === "salesInbox.forward")?.refuse(403, "FORBIDDEN");
    await screen.findByRole("alert");
    expect(readTabValue(draftKey(chatId))).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
