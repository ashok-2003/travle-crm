"use client";

// The messages of a chat, in a scroll area of their own (spec 3.2): oldest at the top, the newest at the bottom, a line between
// days, earlier messages loaded as the top is reached (and a button for whoever cannot scroll), and "New messages" when some
// arrived below while the person was reading higher up. The team's notes sit among the messages at their time (sales inbox
// spec 6); a search in the chat shows only what matches. The reply box is not in here: it stays where it is.
import type { ChatMessage, ConversationNote } from "@travel-crm/contracts/inbox";
import { ArrowDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDay, formatPhoneNumber } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { ChatJumpContext } from "./chat-jump";
import { useChatScroll } from "./chat-scroll";
import { MediaViewerProvider } from "./media/media-viewer";
import { MessageBubble } from "./message-bubble";
import { NoteBubble } from "./note-bubble";
import { PendingBubble } from "./pending-bubble";
import { useConversation, useMessages, type MessageFilter } from "./use-inbox";
import { useMarkRead } from "./use-inbox-tools";
import { useNotes } from "./use-sales-inbox";

/** The calendar day of an instant in the zone, to tell where a new day starts. */
const dayKey = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(instant),
  );

type Pages = ReturnType<typeof useMessages>;

/** One line of the chat: a message, or a team note. */
type Entry =
  { kind: "message"; at: string; message: ChatMessage } | { kind: "note"; at: string; note: ConversationNote };

function Loaded({
  conversationId,
  customerName,
  messages,
  items,
  notes,
  notePeople,
}: {
  conversationId: string;
  customerName: string;
  messages: Pages;
  items: ChatMessage[];
  notes: ConversationNote[];
  notePeople: Record<string, string>;
}) {
  const t = useTranslations("inbox.chat");
  const { timeZone } = useMe().organization;
  // Newest first from the api; the chat reads oldest at the top.
  const oldestFirst: ChatMessage[] = [...items].reverse();
  const newest = oldestFirst.at(-1);
  const { root, unseen, unseenCount, away, toBottom } = useChatScroll({
    oldestId: oldestFirst[0]?.id ?? null,
    newestId: newest?.id ?? null,
    newestIsOurs: newest?.origin === "staff_crm" && newest.status === "queued",
    total: oldestFirst.length,
    hasEarlier: messages.hasNextPage,
    loadingEarlier: messages.isFetchingNextPage,
    loadEarlier: () => void messages.fetchNextPage(),
  });
  // Going to a quoted message: earlier pages are loaded until it is among them, then it scrolls into view and flashes.
  const shown = useRef(oldestFirst);
  useEffect(() => {
    shown.current = oldestFirst;
  });
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const { fetchNextPage } = messages;
  const jumpTo = useCallback(
    async (messageId: string) => {
      let more = true;
      while (more && !shown.current.some((message) => message.id === messageId)) {
        more = (await fetchNextPage()).hasNextPage;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => {
            resolve();
          }),
        );
      }
      const target = root.current?.querySelector(`[data-message-id="${messageId}"]`);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightId(messageId);
      window.setTimeout(() => {
        setHighlightId(null);
      }, 1600);
    },
    [fetchNextPage, root],
  );
  const jump = { jumpTo: (messageId: string) => void jumpTo(messageId), highlightId };
  const now = new Date();
  const today = dayKey(now.toISOString(), timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timeZone);
  const dayLabel = (instant: string) => {
    const day = dayKey(instant, timeZone);
    if (day === today) return t("today");
    if (day === yesterday) return t("yesterday");
    return formatDay(new Date(instant), { timeZone });
  };
  // Open with new messages in it: the member has read them (their unread count goes; sales inbox spec 5).
  const { mutate: mark } = useMarkRead();
  const newestId = newest?.id;
  // Not before the list has been asked for afresh: the read mark is what says what was unread, and a saved copy of the last
  // visit must not clear it first.
  const fresh = messages.isFetchedAfterMount;
  useEffect(() => {
    if (newestId !== undefined && fresh) mark({ conversationId });
  }, [newestId, fresh, conversationId, mark]);
  // What was unread as the chat opened stays on screen as a divider while the chat is open, though the read mark moves.
  const [opened, setOpened] = useState<{ count: number; firstMessageId: string | null } | null | undefined>(undefined);
  const unreadNow = messages.data?.pages[0]?.unread;
  if (opened === undefined && fresh && unreadNow !== undefined) setOpened(unreadNow);
  const people = Object.fromEntries(messages.data?.pages.flatMap((page) => Object.entries(page.people)) ?? []);
  // Notes older than the oldest message shown wait until the earlier messages are loaded, so they land in place.
  const oldestShown = oldestFirst[0]?.occurredAt;
  const shownNotes = notes.filter(
    (note) => !messages.hasNextPage || oldestShown === undefined || note.createdAt >= oldestShown,
  );
  const entries: Entry[] = [
    ...oldestFirst.map((message): Entry => ({ kind: "message", at: message.occurredAt, message })),
    ...shownNotes.map((note): Entry => ({ kind: "note", at: note.createdAt, note })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const rows: ReactNode[] = [];
  entries.forEach((entry, index) => {
    const day = dayKey(entry.at, timeZone);
    const previous = entries[index - 1];
    const newDay = previous === undefined || dayKey(previous.at, timeZone) !== day;
    if (newDay) {
      // A day's chip, centred over the wallpaper as WhatsApp's.
      rows.push(
        <li key={`day-${day}`} className="sticky top-1 z-(--z-sticky) my-3 flex justify-center" aria-hidden="true">
          <span className="rounded-lg bg-chat-date-chip px-3 py-1 text-caption font-medium text-muted-foreground uppercase">
            {dayLabel(entry.at)}
          </span>
        </li>,
      );
    }
    if (entry.kind === "note") {
      rows.push(<NoteBubble key={`note-${entry.note.id}`} note={entry.note} people={notePeople} />);
      return;
    }
    const { message } = entry;
    if (opened !== null && opened !== undefined && opened.count > 0 && opened.firstMessageId === message.id) {
      rows.push(
        <li key="unread-divider" className="my-3 flex justify-center">
          <span className="rounded-lg bg-chat-date-chip px-3 py-1 text-caption font-medium text-muted-foreground">
            {t("unreadDivider", { count: opened.count })}
          </span>
        </li>,
      );
    }
    rows.push(
      <MessageBubble
        key={message.id}
        message={message}
        senderName={message.sentBy === null ? null : (people[message.sentBy] ?? null)}
        quotedSender={
          message.quoted?.direction === "out"
            ? message.quoted.sentBy === null
              ? t("reply.teammate")
              : (people[message.quoted.sentBy] ?? t("reply.teammate"))
            : customerName
        }
        first={newDay || previous.kind !== "message" || previous.message.direction !== message.direction}
      />,
    );
  });
  return (
    <ChatJumpContext.Provider value={jump}>
      <MediaViewerProvider messages={oldestFirst} customerName={customerName} people={people}>
        <div className="absolute inset-0">
          <ScrollArea ref={root} className="h-full" aria-label={t("messages")}>
            <div className="flex flex-col gap-3 pt-2 pb-4">
              <div className="flex justify-center">
                <ShowMoreButton pages={messages} label={t("earlier")} />
              </div>
              <ol className="flex flex-col" aria-label={t("messages")}>
                {rows.map((row, index) => (
                  <Fragment key={index}>{row}</Fragment>
                ))}
                <PendingBubble conversationId={conversationId} />
              </ol>
            </div>
          </ScrollArea>
          {unseen ? (
            <Button
              variant="secondary"
              className="absolute right-4 bottom-3 rounded-full"
              onClick={toBottom}
              aria-label={t("newMessages")}
            >
              <ArrowDownIcon aria-hidden="true" />
              {t("newMessages")}
              {unseenCount > 0 && <span className="numbers">{unseenCount > 99 ? "99+" : unseenCount}</span>}
            </Button>
          ) : (
            away && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-4 bottom-3 rounded-full"
                onClick={toBottom}
                aria-label={t("toBottom")}
              >
                <ArrowDownIcon aria-hidden="true" />
              </Button>
            )
          )}
        </div>
      </MediaViewerProvider>
    </ChatJumpContext.Provider>
  );
}

export function MessageList({ conversationId, filter }: { conversationId: string; filter?: MessageFilter }) {
  const t = useTranslations("inbox.chat");
  const messages = useMessages(conversationId, true, filter);
  const notes = useNotes(conversationId);
  const header = useConversation(conversationId).data;
  const customerName = header === undefined ? "" : (header.name ?? formatPhoneNumber(header.phone));
  const searching = filter !== undefined && (filter.search.length >= 2 || filter.starredOnly);
  if (messages.items === undefined) {
    return messages.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={messages.error}
        retryLabel={t("retry")}
        onRetry={() => void messages.refetch()}
      />
    ) : (
      <LoadingRows shape="twoLines" label={t("loading")} />
    );
  }
  if (messages.items.length === 0) {
    return <p className="p-4 text-center text-muted-foreground">{searching ? t("noMatches") : t("noMessages")}</p>;
  }
  return (
    <Loaded
      conversationId={conversationId}
      customerName={customerName}
      messages={messages}
      items={messages.items}
      notes={searching ? [] : (notes.data?.items ?? [])}
      notePeople={notes.data?.people ?? {}}
    />
  );
}
