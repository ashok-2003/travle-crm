"use client";

// The messages of a chat, in a scroll area of their own (spec 3.2): oldest at the top, the newest at the bottom, a line between
// days, earlier messages loaded as the top is reached (and a button for whoever cannot scroll), and "New messages" when some
// arrived below while the person was reading higher up. The reply box is not in here: it stays where it is.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { ArrowDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useChatScroll } from "./chat-scroll";
import { MessageBubble } from "./message-bubble";
import { useMessages } from "./use-inbox";

/** The calendar day of an instant in the zone, to tell where a new day starts. */
const dayKey = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(instant),
  );

type Pages = ReturnType<typeof useMessages>;

function Loaded({ messages, items }: { messages: Pages; items: ChatMessage[] }) {
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
  const people = Object.fromEntries(messages.data?.pages.flatMap((page) => Object.entries(page.people)) ?? []);
  const rows: ReactNode[] = [];
  oldestFirst.forEach((message, index) => {
    const day = dayKey(message.occurredAt, timeZone);
    const previous = oldestFirst[index - 1];
    if (previous === undefined || dayKey(previous.occurredAt, timeZone) !== day) {
      rows.push(
        <li
          key={`day-${day}`}
          className="flex items-center gap-3 text-caption text-muted-foreground"
          aria-hidden="true"
        >
          <Separator className="flex-1" />
          {formatDay(new Date(message.occurredAt), { timeZone })}
          <Separator className="flex-1" />
        </li>,
      );
    }
    rows.push(
      <MessageBubble
        key={message.id}
        message={message}
        senderName={message.sentBy === null ? null : (people[message.sentBy] ?? null)}
      />,
    );
  });
  return (
    <div className="absolute inset-0">
      <ScrollArea ref={root} className="h-full" aria-label={t("messages")}>
        <div className="flex flex-col gap-3 pr-3">
          <ShowMoreButton pages={messages} label={t("earlier")} />
          <ol className="flex flex-col gap-2" aria-label={t("messages")}>
            {rows.map((row, index) => (
              <Fragment key={index}>{row}</Fragment>
            ))}
          </ol>
        </div>
      </ScrollArea>
      {unseen && (
        <Button size="sm" className="absolute bottom-2 left-1/2 -translate-x-1/2" onClick={toBottom}>
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
  if (messages.items.length === 0) return <p className="text-muted-foreground">{t("noMessages")}</p>;
  return <Loaded messages={messages} items={messages.items} />;
}
