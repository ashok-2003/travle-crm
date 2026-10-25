"use client";

// The messages of a chat, in a scroll area of their own (spec 3.2): oldest at the top, the newest at the bottom, a line between
// days, earlier messages loaded as the top is reached (and a button for whoever cannot scroll), and "New messages" when some
// arrived below while the person was reading higher up. The reply box is not in here: it stays where it is.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { ArrowDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, type ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useChatScroll } from "./chat-scroll";
import { MessageBubble } from "./message-bubble";
import { useMessages } from "./use-inbox";
import { useMarkRead } from "./use-inbox-tools";

/** The calendar day of an instant in the zone, to tell where a new day starts. */
const dayKey = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(instant),
  );

type Pages = ReturnType<typeof useMessages>;

function Loaded({
  conversationId,
  messages,
  items,
}: {
  conversationId: string;
  messages: Pages;
  items: ChatMessage[];
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
  const rows: ReactNode[] = [];
  oldestFirst.forEach((message, index) => {
    const day = dayKey(message.occurredAt, timeZone);
    const previous = oldestFirst[index - 1];
    const newDay = previous === undefined || dayKey(previous.occurredAt, timeZone) !== day;
    if (newDay) {
      // A day's chip, centred over the wallpaper as WhatsApp's.
      rows.push(
        <li key={`day-${day}`} className="sticky top-1 z-(--z-sticky) my-3 flex justify-center" aria-hidden="true">
          <span className="rounded-lg bg-background px-3 py-1 text-caption font-medium text-muted-foreground">
            {dayLabel(message.occurredAt)}
          </span>
        </li>,
      );
    }
    rows.push(
      <MessageBubble
        key={message.id}
        message={message}
        senderName={message.sentBy === null ? null : (people[message.sentBy] ?? null)}
        first={newDay || previous.direction !== message.direction}
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

export function MessageList({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat");
  const messages = useMessages(conversationId, true);
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
  if (messages.items.length === 0) return <p className="p-4 text-center text-muted-foreground">{t("noMessages")}</p>;
  return <Loaded conversationId={conversationId} messages={messages} items={messages.items} />;
}
