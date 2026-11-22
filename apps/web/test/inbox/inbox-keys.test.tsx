// The Inbox's keys (inbox revamp spec, part 1 item 6): ↑ and ↓ move between the chats when the person isn't typing (and
// not after a click among the messages, which they scroll), Alt with them anywhere; Ctrl+K or ⌘K goes to the search; Esc
// closes the contact panel kept open beside the chat, and only then the chat.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxPanesProvider } from "@/inbox/inbox-panes";
import { takeReplyFocus } from "@/inbox/reply-focus";
import { useInboxKeys } from "@/inbox/use-inbox-keys";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const id = (n: number) => `01900000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`;

function Inbox({ openId, panel = false }: { openId: string | null; panel?: boolean }) {
  useInboxKeys(openId);
  return (
    <>
      <div data-inbox-search>
        <input type="search" aria-label="Search chats" />
      </div>
      <div data-chat-list>
        <div data-slot="scroll-area-viewport">
          <div role="list" aria-label="Chats">
            {[1, 2, 3].map((n) => (
              <a key={n} href={`/inbox/${id(n)}`} data-chat-row="true" data-chat-id={id(n)}>
                Chat {n}
              </a>
            ))}
          </div>
        </div>
      </div>
      <header data-chat-header>
        <button type="button">Stage</button>
      </header>
      <div data-chat-messages>
        <div data-slot="scroll-area-viewport">
          <p>A message</p>
        </div>
      </div>
      <textarea aria-label="Message" data-reply-box />
      {panel && (
        <aside data-contact-panel>
          <button type="button">Add follow-up</button>
        </aside>
      )}
      <button type="button" data-panel-toggle>
        Contact and lead details
      </button>
    </>
  );
}

const inInbox = (openId: string | null, panel = false) => (
  <InboxPanesProvider width={1400}>
    <Inbox openId={openId} panel={panel} />
  </InboxPanesProvider>
);

describe("the Inbox's keys", () => {
  beforeEach(() => {
    router.push.mockClear();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves to the chat below or above with the arrows when nobody is typing, and from the first when none is open", () => {
    const view = render(inInbox(id(2)));
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(router.push).toHaveBeenLastCalledWith(`/inbox/${id(3)}`);
    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    expect(router.push).toHaveBeenLastCalledWith(`/inbox/${id(1)}`);
    view.rerender(inInbox(null));
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(router.push).toHaveBeenLastCalledWith(`/inbox/${id(1)}`);
  });

  it("leaves the arrows to a box being typed in, and to the messages after a click among them; Alt moves anywhere", () => {
    render(inInbox(id(2)));
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "ArrowDown", altKey: true });
    expect(router.push).toHaveBeenLastCalledWith(`/inbox/${id(3)}`);
    router.push.mockClear();
    fireEvent.pointerDown(screen.getByText("A message"));
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("leaves the arrows to the contact panel, the chat's bar and any scrolling part but the list", () => {
    render(inInbox(id(2), true));
    for (const name of ["Add follow-up", "Stage"]) {
      const button = screen.getByRole("button", { name });
      button.focus();
      fireEvent.keyDown(button, { key: "ArrowDown" });
    }
    expect(router.push).not.toHaveBeenCalled();
    // A click among the chats gives the arrows back to the list.
    fireEvent.pointerDown(screen.getByRole("link", { name: "Chat 1" }));
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(router.push).toHaveBeenLastCalledWith(`/inbox/${id(3)}`);
  });

  it("from a reply box, puts the focus in the next chat's reply box", () => {
    render(inInbox(id(2)));
    const box = screen.getByRole("textbox", { name: "Message" });
    box.focus();
    fireEvent.keyDown(box, { key: "ArrowUp", altKey: true });
    expect(router.push).toHaveBeenLastCalledWith(`/inbox/${id(1)}`);
    expect(takeReplyFocus(id(1))).toBe(true);
    expect(takeReplyFocus(id(1))).toBe(false);
  });

  it("goes to the search with Ctrl+K or ⌘K, from the reply box too", () => {
    render(inInbox(id(2)));
    const search = screen.getByRole("searchbox", { name: "Search chats" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "k", ctrlKey: true });
    expect(search).toHaveFocus();
    screen.getByRole("textbox", { name: "Message" }).focus();
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(search).toHaveFocus();
  });

  it("closes the contact panel beside the chat with Esc, the focus back on its button, and the chat only after", () => {
    window.localStorage.setItem("travel-crm.inbox.contact-panel", "open");
    render(inInbox(id(2), true));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(window.localStorage.getItem("travel-crm.inbox.contact-panel")).toBeNull();
    expect(screen.getByRole("button", { name: "Contact and lead details" })).toHaveFocus();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("closes the open chat with Esc when no panel is open beside it", () => {
    render(inInbox(id(2)));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(router.push).toHaveBeenLastCalledWith("/inbox");
  });
});
