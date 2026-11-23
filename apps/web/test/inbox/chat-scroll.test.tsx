// Where a chat opens and how it shows what came in (inbox revamp spec, part 1 item 3): at its first unread message, the
// divider above it in view; else where the person left it in this tab; and, scrolled up, "2 new messages" that takes them
// down. jsdom lays nothing out, so each message is drawn as 100px tall in a 400px view.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "@/inbox/message-list";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
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
  number: { id: "01900000-0000-7000-8000-0000000000f1", label: "WhatsApp", status: "connected" },
  otherChats: [],
};
const VIEW = 400;
const ROW = 100;

/** Messages 1 to `count`, newest first as the api sends them. */
const messagesUpTo = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    aMessage({ id: id(count - index), body: `Message ${String(count - index)}`, occurredAt: at(count - index) }),
  );

const isViewport = (element: Element) =>
  element instanceof HTMLElement && element.dataset.slot === "scroll-area-viewport";
const rowsIn = (viewport: Element) => [...viewport.querySelectorAll("[data-message-id]")];

const saved = {
  rect: Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect"),
  scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight"),
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight"),
};

beforeAll(() => {
  // Each message a row of 100px, from the top of the content; the view 400px tall at the top of the screen.
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: Element) {
      const viewport = this.closest('[data-slot="scroll-area-viewport"]');
      if (viewport === null || isViewport(this)) return DOMRect.fromRect({ x: 0, y: 0, width: 600, height: VIEW });
      const index = rowsIn(viewport).indexOf(this);
      if (index === -1) return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
      return DOMRect.fromRect({ x: 0, y: index * ROW - viewport.scrollTop, width: 600, height: ROW });
    },
  });
  Object.defineProperty(Element.prototype, "scrollHeight", {
    configurable: true,
    get(this: Element) {
      return isViewport(this) ? rowsIn(this).length * ROW : 0;
    },
  });
  Object.defineProperty(Element.prototype, "clientHeight", {
    configurable: true,
    get(this: Element) {
      return isViewport(this) ? VIEW : 0;
    },
  });
});
afterAll(() => {
  for (const [name, descriptor] of Object.entries(saved)) {
    const property = name === "rect" ? "getBoundingClientRect" : name;
    if (descriptor === undefined) Reflect.deleteProperty(Element.prototype, property);
    else Object.defineProperty(Element.prototype, property, descriptor);
  }
});

const viewportOf = async () => {
  const list = await screen.findByRole("list", { name: "Messages" });
  const viewport = list.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  if (viewport === null) throw new Error("no scroll area");
  return viewport;
};

describe("where a chat opens", () => {
  let answer: { items: ReturnType<typeof messagesUpTo>; unread: { count: number; firstMessageId: string } | null };
  beforeEach(() => {
    screenIs("wide");
    window.sessionStorage.clear();
    answer = { items: messagesUpTo(10), unread: null };
    answerApi({
      "inbox.conversation": header,
      "salesInbox.notes": { items: [], people: {} },
      "inbox.markRead": null,
      "inbox.messages": () => ({ items: answer.items, nextCursor: null, people: {}, unread: answer.unread }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lands on the first unread message, with the divider that names them above it", async () => {
    answer.unread = { count: 2, firstMessageId: id(9) };
    renderWithApi(<MessageList conversationId={chatId} />, newQueryClient());
    expect(await screen.findByText("2 unread messages")).toBeInTheDocument();
    const viewport = await viewportOf();
    // Message 9 is the ninth row: 800px down, with room above it for the divider.
    await waitFor(() => {
      expect(viewport.scrollTop).toBe(8 * ROW - 56);
    });
  });

  it("opens where the person left it in this tab, and at the newest once they had gone down again", async () => {
    keepTabValue(`inbox.scroll.${chatId}`, JSON.stringify({ id: id(3), offset: 20 }));
    const first = renderWithApi(<MessageList conversationId={chatId} />, newQueryClient());
    const viewport = await viewportOf();
    await waitFor(() => {
      expect(viewport.scrollTop).toBe(2 * ROW - 20);
    });
    // The person scrolls to message 4, a little above the view's top, and leaves.
    act(() => {
      viewport.scrollTop = 350;
      fireEvent.scroll(viewport);
    });
    await waitFor(() => {
      expect(JSON.parse(readTabValue(`inbox.scroll.${chatId}`) ?? "null")).toEqual({ id: id(4), offset: -50 });
    });
    first.unmount();
    renderWithApi(<MessageList conversationId={chatId} />, newQueryClient());
    const again = await viewportOf();
    await waitFor(() => {
      expect(again.scrollTop).toBe(350);
    });
    // Down to the newest: nothing is kept, and the chat opens there.
    await act(async () => {
      again.scrollTop = 10 * ROW - VIEW;
      fireEvent.scroll(again);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(readTabValue(`inbox.scroll.${chatId}`)).toBeNull();
  });

  it("says how many came in below while the person read higher up, and takes them down", async () => {
    const queryClient = newQueryClient();
    renderWithApi(<MessageList conversationId={chatId} />, queryClient);
    const viewport = await viewportOf();
    act(() => {
      viewport.scrollTop = 100;
      fireEvent.scroll(viewport);
    });
    answer.items = messagesUpTo(12);
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    const button = await screen.findByRole("button", { name: /2 new messages/ });
    await userEvent.click(button);
    expect(screen.queryByRole("button", { name: /new messages/ })).not.toBeInTheDocument();
    expect(viewport.scrollTop).toBe(12 * ROW);
  });

  /** A chat of `count` messages served ten a page, newest first, the first unread being `firstUnread`. */
  function pagedChat(count: number, firstUnread: number) {
    const all = messagesUpTo(count);
    const api = answerApi({
      "inbox.conversation": header,
      "salesInbox.notes": { items: [], people: {} },
      "inbox.markRead": null,
      "inbox.messages": (input: unknown) => {
        const before = (input as { before?: string }).before;
        const start = before === undefined ? 0 : all.findIndex((message) => message.id === before) + 1;
        const items = all.slice(start, start + 10);
        return {
          items,
          nextCursor: start + 10 < all.length ? (items.at(-1)?.id ?? null) : null,
          people: {},
          unread: { count: count - firstUnread + 1, firstMessageId: id(firstUnread) },
        };
      },
    });
    return api;
  }

  it("loads earlier pages to land on a first unread message that isn't among the newest", async () => {
    const api = pagedChat(20, 5);
    renderWithApi(<MessageList conversationId={chatId} />, newQueryClient());
    expect(await screen.findByText("16 unread messages")).toBeInTheDocument();
    const viewport = await viewportOf();
    // Message 5 is the fifth row once the earlier page is in.
    await waitFor(() => {
      expect(viewport.scrollTop).toBe(4 * ROW - 56);
    });
    expect(api.of("inbox.messages")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Go to the 16 unread messages" })).not.toBeInTheDocument();
  });

  it("past three earlier pages, opens at the newest with the way up to the first unread", async () => {
    const api = pagedChat(50, 2);
    renderWithApi(<MessageList conversationId={chatId} />, newQueryClient());
    const way = await screen.findByRole("button", { name: "Go to the 49 unread messages" });
    // The newest page and three earlier ones, no more.
    expect(api.of("inbox.messages")).toHaveLength(4);
    const viewport = await viewportOf();
    expect(viewport.scrollTop).toBe(40 * ROW);
    await userEvent.click(way);
    await waitFor(() => {
      expect(api.of("inbox.messages")).toHaveLength(5);
    });
    expect(screen.queryByRole("button", { name: "Go to the 49 unread messages" })).not.toBeInTheDocument();
  });
});
