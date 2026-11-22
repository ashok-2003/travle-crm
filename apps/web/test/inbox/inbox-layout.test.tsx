// The Inbox's list never rebuilds (inbox revamp spec, part 1 item 1): /inbox and /inbox/<id> share one layout, so choosing a
// chat changes only the chat beside the list: the list's own scroll position and its filter stay as they were, and the
// open chat is marked in it. On a phone the chat covers the list, which waits under it as it was.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxScreen } from "@/inbox/inbox-screen";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { answerApi } from "./answer-api";

const navigation = vi.hoisted(() => ({ params: {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/inbox",
  useParams: () => navigation.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  // The list reads ?show= (the AI agent page's Answered by the AI): none here.
  useSearchParams: () => new URLSearchParams(),
}));

const id = (n: number) => `01900000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`;
const aRow = (n: number) => ({
  id: id(n),
  phone: `+9198765432${String(n).padStart(2, "0")}`,
  // By letter: a row's name runs into its time ("Customer 1" and "26 Oct" read as "Customer 126 Oct").
  name: `Customer ${String.fromCharCode(64 + n)}`,
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
const summary = {
  waiting: 3,
  late: 0,
  unread: 0,
  mine: 0,
  unassigned: 0,
  snoozed: 0,
  stages: { new: 0, contacted: 0, quote_sent: 0, booking_requested: 0, won: 0 },
};

/** The chats' list scroll area: its viewport is what scrolls. */
const listViewport = () => {
  const viewport = screen
    .getByRole("list", { name: "Chats" })
    .closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  if (viewport === null) throw new Error("the list has no scroll area");
  return viewport;
};

describe("the Inbox's shared layout", () => {
  beforeEach(() => {
    navigation.params = {};
    window.sessionStorage.clear();
    window.localStorage.clear();
    answerApi({
      "inbox.status": { configured: true, connected: true, connectionStatus: "connected", demo: false, number: null },
      "inbox.conversations": { items: Array.from({ length: 12 }, (_, index) => aRow(index + 1)), nextCursor: null },
      "salesInbox.summary": summary,
      "inbox.tags": [],
      "leads.owners": [],
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const chatArea = (label: string): ReactNode => <section aria-label={label} />;

  it("keeps the list's scroll and filter, and marks the chat, when one is chosen and then another", async () => {
    screenIs("wide");
    const view = renderWithApi(<InboxScreen>{chatArea("No chat")}</InboxScreen>, newQueryClient());
    await screen.findByRole("link", { name: /Customer L/ });
    await userEvent.click(screen.getByRole("radio", { name: /Waiting/ }));
    const viewport = listViewport();
    viewport.scrollTop = 480;

    navigation.params = { conversationId: id(7) };
    view.rerender(<InboxScreen>{chatArea("Chat 7")}</InboxScreen>);
    expect(screen.getByRole("region", { name: "Chat 7" })).toBeInTheDocument();
    navigation.params = { conversationId: id(8) };
    view.rerender(<InboxScreen>{chatArea("Chat 8")}</InboxScreen>);

    // The same list, never built again: its scroll where the person left it, its filter as chosen.
    expect(listViewport()).toBe(viewport);
    expect(viewport.scrollTop).toBe(480);
    expect(screen.getByRole("radio", { name: /Waiting/ })).toBeChecked();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Customer H/ })).toHaveAttribute("aria-current", "page");
    });
    expect(screen.getByRole("link", { name: /Customer G/ })).not.toHaveAttribute("aria-current");
  });

  it("keeps the list under a phone's chat, so Back finds it as it was", async () => {
    screenIs("phone");
    const view = renderWithApi(<InboxScreen>{null}</InboxScreen>, newQueryClient());
    await screen.findByRole("link", { name: /Customer L/ });
    const viewport = listViewport();
    viewport.scrollTop = 300;
    navigation.params = { conversationId: id(3) };
    view.rerender(<InboxScreen>{chatArea("Chat 3")}</InboxScreen>);
    navigation.params = {};
    view.rerender(<InboxScreen>{null}</InboxScreen>);
    expect(listViewport()).toBe(viewport);
    expect(viewport.scrollTop).toBe(300);
  });
});
