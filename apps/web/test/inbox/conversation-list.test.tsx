// The list's two-line rows (inbox revamp spec, items 8 and 10): the wait's colours, the owner only when it isn't the
// member, the plain preview and the AI hand-over's amber marker.
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationList } from "@/inbox/conversation-list";
import { newQueryClient, renderWithApi } from "../organization/api";
import { member } from "../support/members";
import { answerApi } from "./answer-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }) }));

const NOW = new Date("2026-10-26T10:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const me = member({ permissions: ["leads:view"], userId: "0199a000-0000-7000-8000-0000000000a1" });
const someoneElse = "0199a000-0000-7000-8000-0000000000b2";

const chat = (overrides: Partial<ConversationListItem> = {}): ConversationListItem => ({
  id: "01900000-0000-7000-8000-000000000001",
  connectionId: "01900000-0000-7000-8000-0000000000aa",
  phone: "+919876543210",
  name: "Meera Rao",
  personId: null,
  preview: "Hello *there*",
  lastMessageAt: minutesAgo(5),
  needsReply: false,
  handedOver: false,
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
  ...overrides,
});
const lead = (ownerUserId: string | null) => ({
  id: "01900000-0000-7000-8000-0000000000c1",
  stage: "new",
  ownerUserId,
});

describe("a chat's row", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    answerApi({ "leads.owners": [{ userId: someoneElse, name: "Ravi Kumar" }] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const show = (item: ConversationListItem) =>
    renderWithApi(<ConversationList items={[item]} currentId={null} />, newQueryClient(), me);

  it("is two lines: the name and the time on the first, the plain preview and the stage on the second", () => {
    show(chat({ lead: lead(me.user.id) }));
    const row = screen.getByRole("link");
    expect(within(row).getByText("Meera Rao")).toBeInTheDocument();
    expect(within(row).getByText("5m")).toBeInTheDocument();
    expect(within(row).getByText("Hello there")).toBeInTheDocument();
    expect(within(row).getByText("New")).toBeInTheDocument();
  });

  it("shows the wait instead of the time, amber at 15 minutes and red once late", () => {
    const { unmount } = show(chat({ needsReply: true, waitingSince: minutesAgo(15) }));
    expect(screen.getByText("waiting 15m")).toHaveClass("text-status-attention-ink");
    unmount();
    show(chat({ needsReply: true, waitingSince: minutesAgo(25) }));
    expect(screen.getByText("waiting 25m")).toHaveClass("text-status-bad-ink");
    expect(screen.queryByText("5m")).not.toBeInTheDocument();
  });

  it("shows the unread count in the people violet", () => {
    show(chat({ unread: 3 }));
    expect(screen.getByLabelText("3 unread messages")).toHaveClass("bg-people-tint");
  });

  it("names the owner only when it isn't the member", async () => {
    const { unmount } = show(chat({ lead: lead(someoneElse) }));
    expect((await screen.findAllByText("Owner: Ravi Kumar")).length).toBeGreaterThan(0);
    unmount();
    show(chat({ lead: lead(me.user.id) }));
    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
  });

  it("wears an amber marker when the AI handed the chat to a person", () => {
    const { unmount } = show(chat({ handedOver: true, needsReply: true }));
    expect(screen.getByRole("img", { name: "The AI handed this chat to a person" })).toHaveClass(
      "text-status-attention-ink",
    );
    unmount();
    show(chat());
    expect(screen.queryByRole("img", { name: "The AI handed this chat to a person" })).not.toBeInTheDocument();
  });
});
