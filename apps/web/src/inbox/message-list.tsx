"use client";

// The messages of a chat, in a scroll area of their own (spec 3.2): oldest at the top, the newest at the bottom, a line between
// days, earlier messages loaded as the top is reached (and a button for whoever cannot scroll), and "New messages" when some
// arrived below while the person was reading higher up. The team's notes sit among the messages at their time (sales inbox
// spec 6); a search in the chat shows only what matches. At the foot, the AI agent's "typing" while it answers. The reply
// box is not in here: it stays where it is.
import type { ChatMessage, ConversationNote } from "@travel-crm/contracts/inbox";
import { ArrowDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, type ReactNode } from "react";
import { AiTyping } from "@/ai/ai-turn";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useChatScroll } from "./chat-scroll";
import { MessageBubble } from "./message-bubble";
import { NoteBubble } from "./note-bubble";
import { useMessages, type MessageFilter } from "./use-inbox";
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
  messages,
  items,
  notes,
  notePeople,
}: {
  conversationId: string;
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
  const { root, unseen, toBottom } = useChatScroll({
    oldestId: oldestFirst[0]?.id ?? null,
    newestId: newest?.id ?? null,
    newestIsOurs: newest?.origin === "staff_crm" && newest.status === "queued",
    hasEarlier: messages.hasNextPage,
    loadingEarlier: messages.isFetchingNextPage,
    loadEarlier: () => void messages.fetchNextPage(),
  });
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
  useEffect(() => {
    if (newestId !== undefined) mark({ conversationId });
  }, [newestId, conversationId, mark]);
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
          <span className="rounded-lg bg-chat-bubble-in px-3 py-1 text-caption font-medium text-muted-foreground uppercase">
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
    rows.push(
      <MessageBubble
        key={message.id}
        message={message}
        senderName={message.sentBy === null ? null : (people[message.sentBy] ?? null)}
        first={newDay || previous.kind !== "message" || previous.message.direction !== message.direction}
      />,
    );
  });
  return (
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
            <AiTyping conversationId={conversationId} />
          </ol>
        </div>
      </ScrollArea>
      {unseen && (
        <Button
          variant="secondary"
          className="absolute right-4 bottom-3 rounded-full"
          onClick={toBottom}
          aria-label={t("newMessages")}
        >
          <ArrowDownIcon aria-hidden="true" />
          {t("newMessages")}
        </Button>
      )}
    </div>
  );
}

export function MessageList({ conversationId, filter }: { conversationId: string; filter?: MessageFilter }) {
  const t = useTranslations("inbox.chat");
  const messages = useMessages(conversationId, true, filter);
  const notes = useNotes(conversationId);
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
      messages={messages}
      items={messages.items}
      notes={searching ? [] : (notes.data?.items ?? [])}
      notePeople={notes.data?.people ?? {}}
    />
  );
}
