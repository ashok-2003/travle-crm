"use client";

// The inbox's list of chats (spec 3.1): a dense list, one Item a chat, like the apps staff already use. The avatar holds
// initials (a person icon for a number with no name), then the name (the formatted number when there is none), the first
// words of the last message, the time, and a dot with "Reply due" when the customer wrote last and nobody has answered. A
// number we know nothing of says "New number". The chat open on a computer is marked as the current link.
import type { ConversationListItem } from "@travel-crm/contracts/inbox";
import { UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { StatusDot } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { formatDay, formatPhoneNumber, formatTime } from "@/lib/format";
import { inboxRoute } from "@/lib/routes";
import { useMe } from "@/session/me-context";

/** Up to two initials of a name. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();

export function ConversationList({ items, currentId }: { items: ConversationListItem[]; currentId: string | null }) {
  const t = useTranslations("inbox");
  const { timeZone } = useMe().organization;
  const when = (instant: string | null) => {
    if (instant === null) return "";
    const date = new Date(instant);
    const now = new Date();
    const sameDay = formatDay(date, { timeZone, now }) === formatDay(now, { timeZone, now });
    return sameDay ? formatTime(date, { timeZone }) : formatDay(date, { timeZone, now });
  };
  return (
    <ItemGroup aria-label={t("list")}>
      {items.map((chat, index) => (
        <Fragment key={chat.id}>
          {index > 0 && <ItemSeparator />}
          <div role="listitem">
            <Item asChild size="sm">
              <Link href={inboxRoute(chat.id)} aria-current={chat.id === currentId ? "page" : undefined}>
                <ItemMedia>
                  <Avatar>
                    <AvatarFallback>
                      {chat.name === null ? (
                        <UserRoundIcon aria-hidden="true" className="size-5" />
                      ) : (
                        initialsOf(chat.name)
                      )}
                    </AvatarFallback>
                  </Avatar>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="flex-wrap">
                    <span className="script-leading">{chat.name ?? formatPhoneNumber(chat.phone)}</span>
                    {chat.isNewNumber && <span className="text-label text-muted-foreground">{t("newNumber")}</span>}
                  </ItemTitle>
                  <ItemDescription className="script-leading line-clamp-1" dir="auto">
                    {chat.preview}
                  </ItemDescription>
                </ItemContent>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-caption text-muted-foreground">{when(chat.lastMessageAt)}</span>
                  {chat.needsReply && (
                    <span className="flex items-center gap-1.5 text-caption">
                      <StatusDot tone="attention" />
                      {t("waiting")}
                    </span>
                  )}
                </div>
              </Link>
            </Item>
          </div>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
