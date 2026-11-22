// The Inbox's panes, the chat first (inbox revamp spec, part 1 item 2): the list and the contact panel take a share of the
// inbox between their bounds, the chat everything left and never under 520px; where the panel would squeeze it, the panel
// floats over the chat instead, opened only when asked for. Whether the panel beside the chat is open is kept in the browser.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/inbox/chat-panel";
import { InboxChat, InboxHome } from "@/inbox/inbox-chat";
import { CHAT_MIN_WIDTH, inboxPanes, InboxPanesProvider } from "@/inbox/inbox-panes";
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

/** The inbox's width on a screen of each size: the screen less the sidebar's rail. */
const RAIL = 56;

describe("the panes' widths", () => {
  it("give the list and the panel their share of the inbox, between their bounds", () => {
    expect(inboxPanes(1024 - RAIL)).toMatchObject({ list: 300, panel: 300 });
    expect(inboxPanes(1440 - RAIL).list).toBeCloseTo(0.24 * (1440 - RAIL));
    expect(inboxPanes(1440 - RAIL).panel).toBeCloseTo(0.22 * (1440 - RAIL));
    expect(inboxPanes(1920 - RAIL)).toMatchObject({ list: 400, panel: 380 });
  });

  it("keep the panel beside the chat only where the chat keeps its 520px, at 1280 and up", () => {
    // From 1024 the list and the chat share the screen, the chat at 520px or more.
    const { list } = inboxPanes(1024 - RAIL);
    expect(1024 - RAIL - list - 1).toBeGreaterThanOrEqual(CHAT_MIN_WIDTH);
    const docks = [1024, 1280, 1440, 1728, 1920].map((screenWidth) => inboxPanes(screenWidth - RAIL).panelDocks);
    expect(docks).toEqual([false, true, true, true, true]);
    for (const screenWidth of [1280, 1440, 1728, 1920]) {
      const width = screenWidth - RAIL;
      const { list, panel } = inboxPanes(width);
      expect(width - list - panel - 2).toBeGreaterThanOrEqual(CHAT_MIN_WIDTH);
    }
  });
});

describe("the contact panel beside a chat", () => {
  beforeEach(() => {
    screenIs("wide");
    window.localStorage.clear();
    window.sessionStorage.clear();
    answerApi({
      "inbox.conversation": (input: unknown) => header((input as { conversationId: string }).conversationId),
      "inbox.messages": { items: [], nextCursor: null, people: {}, unread: null },
      "salesInbox.notes": { items: [], people: {} },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const inInbox = (width: number, conversationId: string) => (
    <InboxPanesProvider width={width}>
      <ChatPanel key={conversationId} conversationId={conversationId} />
    </InboxPanesProvider>
  );

  it("opens beside the chat where it fits, at its share, and stays open for the next chat", async () => {
    const view = renderWithApi(inInbox(1440 - RAIL, chatA), newQueryClient());
    await userEvent.click(await screen.findByRole("button", { name: "Contact and lead details" }));
    const panel = await screen.findByRole("complementary");
    expect(panel).toHaveStyle({ width: `${String(inboxPanes(1440 - RAIL).panel)}px` });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("travel-crm.inbox.contact-panel")).toBe("open");

    view.rerender(inInbox(1440 - RAIL, chatB));
    await screen.findByRole("region", { name: "Chat with Amit Shah" });
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close the contact details" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("travel-crm.inbox.contact-panel")).toBeNull();
  });

  it("floats over the chat where it would squeeze it, opened only when asked for", async () => {
    window.localStorage.setItem("travel-crm.inbox.contact-panel", "open");
    renderWithApi(inInbox(1024 - RAIL, chatA), newQueryClient());
    await screen.findByRole("region", { name: "Chat with Meera Rao" });
    // Kept open beside the chat on a wider screen; here it waits to be asked for.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Contact and lead details" }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveStyle({ "--panel-width": "300px" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem("travel-crm.inbox.contact-panel")).toBe("open");
  });
});

describe("under 1024px", () => {
  beforeEach(() => {
    // A tablet: wider than a phone, narrower than the two panes need.
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: !query.includes("1024") && !query.includes("1280"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    answerApi({
      "inbox.conversation": header(chatA),
      "inbox.messages": { items: [], nextCursor: null, people: {}, unread: null },
      "salesInbox.notes": { items: [], people: {} },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows one pane at a time: the chat over the list, with a way back, and nothing beside an empty list", async () => {
    const chat = renderWithApi(<InboxChat conversationId={chatA} />, newQueryClient());
    await screen.findByRole("region", { name: "Chat with Meera Rao" });
    expect(screen.getByRole("link", { name: "Back to the chats" })).toBeInTheDocument();
    chat.unmount();
    const { container } = renderWithApi(<InboxHome />, newQueryClient());
    expect(container).toBeEmptyDOMElement();
  });
});
